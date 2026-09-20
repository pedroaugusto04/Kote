import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { resolveProjectSlugFromDir } from '../../project-detector.js';
import { toUrlSlug } from '../../utils/text.js';
import { watchRecursive } from '../../utils/watcher.js';
import {
  AI_HISTORY_CONFIG,
  AI_PROVIDER,
  AI_PROVIDER_NAME,
  AI_SESSION_FILE_DEBOUNCE_MS,
  AI_SESSION_PATH,
  DEFAULT_AI_SESSION_LIMIT,
  JSONL_EXTENSION,
} from '../constants';
import type { AiHistoryProvider, AiSession, AiTurn, AiTokenUsage, ModelUsageDetail } from '../types';
import { asRecord, buildSessionTitle, extractTextContent, keepFinalAssistantTurns, latestRecordTimestamp, parseAiRole, readJsonLines, recentFiles, safeMtime } from './provider.utils';
import { calculateSessionCostWithRateSync } from '../pricing';

const CLAUDE_RECORD_TYPE = {
  USER: 'user',
  ASSISTANT: 'assistant',
} as const;

function cleanContent(raw: string): string {
  return raw
    .replace(/<system-reminder>[\s\S]*?(<\/system-reminder>|$)/gi, '')
    .replace(/<local-command-caveat>[\s\S]*?(<\/local-command-caveat>|$)/gi, '')
    .trim();
}

function parseTurn(value: unknown): AiTurn | null {
  const record = asRecord(value);
  if (!record || record.isMeta === true) return null;
  if (record.type !== CLAUDE_RECORD_TYPE.USER && record.type !== CLAUDE_RECORD_TYPE.ASSISTANT) return null;

  const message = asRecord(record.message);
  if (!message) return null;

  const role = parseAiRole(message.role);
  if (!role) return null;

  const content = cleanContent(extractTextContent(message.content));
  return content ? { role, content } : null;
}

function parseTurns(records: unknown[]): AiTurn[] {
  return keepFinalAssistantTurns(records.map(parseTurn).filter((turn): turn is AiTurn => turn !== null));
}

function resolveProjectSlug(filePath: string): string | undefined {
  const parentDir = path.basename(path.dirname(filePath));
  if (!parentDir) return undefined;

  if (parentDir.startsWith('-')) {
    const candidatePath = parentDir.replace(/^-/, '/').replace(/-/g, '/');
    const detected = resolveProjectSlugFromDir(candidatePath);
    if (detected) return detected;
  }

  const segments = parentDir.split('-');
  return toUrlSlug(segments[segments.length - 1] || parentDir);
}

function extractClaudeTokenUsage(records: unknown[]): AiTokenUsage | undefined {
  const modelAccumulator = new Map<string, { inputTokens: number; outputTokens: number; cachedTokens: number }>();
  let lastModel = '';

  for (const value of records) {
    const record = asRecord(value);
    if (!record || record.type !== CLAUDE_RECORD_TYPE.ASSISTANT) continue;
    const message = asRecord(record.message);
    if (!message) continue;

    const currentModel = (typeof message.model === 'string' && message.model.trim()) ? message.model.trim() : (lastModel || 'claude-3-5-sonnet');
    lastModel = currentModel;

    let acc = modelAccumulator.get(currentModel);
    if (!acc) {
      acc = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
      modelAccumulator.set(currentModel, acc);
    }

    const usage = asRecord(message.usage);
    if (usage) {
      if (typeof usage.input_tokens === 'number') acc.inputTokens += usage.input_tokens;
      if (typeof usage.output_tokens === 'number') acc.outputTokens += usage.output_tokens;
      if (typeof usage.cache_read_input_tokens === 'number') acc.cachedTokens += usage.cache_read_input_tokens;
    }
  }

  if (modelAccumulator.size === 0) return undefined;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  let totalEstimatedCost = 0;

  const byModel: ModelUsageDetail[] = [];

  for (const [mName, acc] of modelAccumulator.entries()) {
    const mTotal = acc.inputTokens + acc.outputTokens;
    const costResult = calculateSessionCostWithRateSync({
      provider: 'anthropic',
      model: mName,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      cachedTokens: acc.cachedTokens,
    });

    totalInputTokens += acc.inputTokens;
    totalOutputTokens += acc.outputTokens;
    totalCachedTokens += acc.cachedTokens;
    totalEstimatedCost += costResult.cost;

    byModel.push({
      model: mName,
      provider: AI_PROVIDER.CLAUDE_CODE,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      totalTokens: mTotal,
      cachedTokens: acc.cachedTokens > 0 ? acc.cachedTokens : undefined,
      estimatedCostUsd: costResult.cost,
      rates: costResult.rates,
    });
  }

  byModel.sort((a, b) => b.totalTokens - a.totalTokens);
  const primary = byModel[0];
  const primaryModel = primary?.model || lastModel || 'claude-3-5-sonnet';

  return {
    provider: AI_PROVIDER.CLAUDE_CODE,
    model: primaryModel,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    cachedTokens: totalCachedTokens > 0 ? totalCachedTokens : undefined,
    estimatedCostUsd: Number(totalEstimatedCost.toFixed(6)),
    rates: primary?.rates,
    byModel: byModel.length > 0 ? byModel : undefined,
  };
}

function parseFile(filePath: string): AiSession | null {
  try {
    const records = readJsonLines(fs.readFileSync(filePath, 'utf8'));
    const turns = parseTurns(records);
    if (turns.length === 0) return null;
    const internalTimestamp = latestRecordTimestamp(records, ['timestamp', 'created_at', 'updated_at']);

    return {
      providerId: AI_PROVIDER.CLAUDE_CODE,
      sessionId: path.basename(filePath, JSONL_EXTENSION),
      title: buildSessionTitle(AI_PROVIDER_NAME[AI_PROVIDER.CLAUDE_CODE], turns),
      turns,
      timestamp: internalTimestamp ?? safeMtime(filePath),
      timestampIsInternal: internalTimestamp !== null,
      projectSlug: resolveProjectSlug(filePath),
      tokenUsage: extractClaudeTokenUsage(records),
    };
  } catch {
    return null;
  }
}

export class ClaudeCodeHistoryProvider implements AiHistoryProvider {
  readonly id = AI_PROVIDER.CLAUDE_CODE;
  readonly name = AI_PROVIDER_NAME[this.id];

  private getHistoryDir(): string {
    const config = vscode.workspace.getConfiguration(AI_HISTORY_CONFIG.SECTION);
    return config.get<string>(AI_HISTORY_CONFIG.CLAUDE_CODE_LOG_PATH) || path.join(os.homedir(), ...AI_SESSION_PATH.CLAUDE_CODE);
  }

  async isEnabled(): Promise<boolean> {
    return fs.existsSync(this.getHistoryDir());
  }

  getSourceMtime(): number {
    return safeMtime(this.getHistoryDir());
  }

  async getRecentSessions(limit = DEFAULT_AI_SESSION_LIMIT): Promise<AiSession[]> {
    return recentFiles(this.getHistoryDir(), (filePath) => filePath.endsWith(JSONL_EXTENSION), limit)
      .map(parseFile)
      .filter((session): session is AiSession => session !== null);
  }

  watchSessions(callback: (session: AiSession) => void): vscode.Disposable {
    const timeouts = new Map<string, NodeJS.Timeout>();
    const watcher = watchRecursive(
      this.getHistoryDir(),
      (fileName) => fileName.endsWith(JSONL_EXTENSION),
      (filePath) => {
        const pending = timeouts.get(filePath);
        if (pending) clearTimeout(pending);
        timeouts.set(filePath, setTimeout(() => {
          timeouts.delete(filePath);
          const session = parseFile(filePath);
          if (session) callback(session);
        }, AI_SESSION_FILE_DEBOUNCE_MS));
      },
    );

    return new vscode.Disposable(() => {
      for (const timeout of timeouts.values()) clearTimeout(timeout);
      watcher.dispose();
    });
  }
}

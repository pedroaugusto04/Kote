import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from '../../config.js';
import { resolveProjectSlugFromDir } from '../../utils/project-detector.js';
import { toUrlSlug } from '../../utils/text.js';
import { AI_PROVIDER, AI_PROVIDER_NAME, AI_SESSION_PATH, JSONL_EXTENSION } from '../constants.js';
import type { AiHistoryProvider, AiSession, AiTurn, AiTokenUsage, ModelUsageDetail } from '../types.js';
import { calculateTokenUsageCost } from '../token-accounting.js';
import { asRecord, buildSessionTitle, extractTextContent, isSession, keepFinalAssistantTurns, parseAiRole, readJsonLines, recentFiles, safeMtime } from './provider.utils.js';

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
  const modelAccumulator = new Map<string, { inputTokens: number; outputTokens: number; cachedTokens: number; cacheWriteTokens: number }>();
  let lastModel = '';

  for (const value of records) {
    const record = asRecord(value);
    if (!record || record.type !== CLAUDE_RECORD_TYPE.ASSISTANT) continue;
    const message = asRecord(record.message);
    if (!message) continue;

    const rawModel = typeof message.model === 'string' ? message.model.trim() : '';
    const currentModel = (rawModel && !rawModel.includes('<') && !rawModel.includes('>')) ? rawModel : (lastModel || 'claude-3-5-sonnet');
    lastModel = currentModel;

    let acc = modelAccumulator.get(currentModel);
    if (!acc) {
      acc = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0 };
      modelAccumulator.set(currentModel, acc);
    }

    const usage = asRecord(message.usage);
    if (usage) {
      if (typeof usage.input_tokens === 'number') acc.inputTokens += usage.input_tokens;
      if (typeof usage.output_tokens === 'number') acc.outputTokens += usage.output_tokens;
      if (typeof usage.cache_read_input_tokens === 'number') acc.cachedTokens += usage.cache_read_input_tokens;
      if (typeof usage.cache_creation_input_tokens === 'number') acc.cacheWriteTokens += usage.cache_creation_input_tokens;
    }
  }

  if (modelAccumulator.size === 0) return undefined;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalEstimatedCost = 0;

  const byModel: ModelUsageDetail[] = [];

  for (const [mName, acc] of modelAccumulator.entries()) {
    const mTotal = acc.inputTokens + acc.outputTokens;
    const costResult = calculateTokenUsageCost({
      provider: 'anthropic',
      model: mName,
      usage: {
        inputTokens: acc.inputTokens,
        outputTokens: acc.outputTokens,
        cachedTokens: acc.cachedTokens,
        cacheWriteTokens: acc.cacheWriteTokens,
      },
    });

    totalInputTokens += acc.inputTokens;
    totalOutputTokens += acc.outputTokens;
    totalCachedTokens += acc.cachedTokens;
    totalCacheWriteTokens += acc.cacheWriteTokens;
    totalEstimatedCost += costResult.cost;

    byModel.push({
      model: mName,
      provider: AI_PROVIDER.CLAUDE_CODE,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      totalTokens: mTotal,
      cachedTokens: acc.cachedTokens > 0 ? acc.cachedTokens : undefined,
      cacheWriteTokens: acc.cacheWriteTokens > 0 ? acc.cacheWriteTokens : undefined,
      estimatedCostUsd: costResult.cost,
      rates: costResult.rates,
    });
  }

  // Sort byModel descending by totalTokens
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
    cacheWriteTokens: totalCacheWriteTokens > 0 ? totalCacheWriteTokens : undefined,
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

    const tokenUsage = extractClaudeTokenUsage(records);

    return {
      providerId: AI_PROVIDER.CLAUDE_CODE,
      sessionId: path.basename(filePath, JSONL_EXTENSION),
      title: buildSessionTitle(AI_PROVIDER_NAME[AI_PROVIDER.CLAUDE_CODE], turns),
      turns,
      timestamp: safeMtime(filePath),
      projectSlug: resolveProjectSlug(filePath),
      tokenUsage,
    };
  } catch {
    return null;
  }
}

export class ClaudeCodeHistoryProvider implements AiHistoryProvider {
  readonly id = AI_PROVIDER.CLAUDE_CODE;
  readonly name = AI_PROVIDER_NAME[this.id];

  async getRecentSessions(limit?: number): Promise<AiSession[]> {
    const config = loadConfig();
    const historyDir = config.aiProviders?.claudeCodeLogPath || path.join(os.homedir(), ...AI_SESSION_PATH.CLAUDE_CODE);
    return recentFiles(historyDir, (filePath) => filePath.endsWith(JSONL_EXTENSION), limit).map(parseFile).filter(isSession);
  }
}

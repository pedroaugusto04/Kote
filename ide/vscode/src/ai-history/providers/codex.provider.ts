import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { resolveProjectSlugFromDir } from '../../project-detector.js';
import { watchRecursive } from '../../utils/watcher.js';
import {
  AI_HISTORY_CONFIG,
  AI_PROVIDER,
  AI_PROVIDER_NAME,
  AI_ROLE,
  AI_SESSION_FILE_DEBOUNCE_MS,
  AI_SESSION_PATH,
  CODEX_FINAL_ANSWER_PHASE,
  CODEX_INTERNAL_USER_PREFIXES,
  DEFAULT_AI_SESSION_LIMIT,
  JSONL_EXTENSION,
} from '../constants';
import type { AiHistoryProvider, AiSession, AiTurn, AiTokenUsage, ModelUsageDetail } from '../types';
import { asRecord, buildSessionTitle, latestRecordTimestamp, parseAiRole, readJsonLines, recentFiles, safeMtime } from './provider.utils';
import { calculateTokenUsageCost } from '../token-accounting';

const CODEX_RECORD_TYPE = {
  SESSION_META: 'session_meta',
  RESPONSE_ITEM: 'response_item',
  MESSAGE: 'message',
} as const;

function textBlocks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const texts: string[] = [];
  for (const candidate of value) {
    const block = asRecord(candidate);
    if (typeof block?.text !== 'string') continue;
    const text = block.text.trim();
    if (text) texts.push(text);
  }
  return texts;
}

function isInternalUserText(text: string): boolean {
  return CODEX_INTERNAL_USER_PREFIXES.some((prefix) => text.startsWith(prefix));
}

function parseTurn(value: unknown): AiTurn | null {
  const record = asRecord(value);
  if (record?.type !== CODEX_RECORD_TYPE.RESPONSE_ITEM) return null;

  const payload = asRecord(record.payload);
  if (payload?.type !== CODEX_RECORD_TYPE.MESSAGE) return null;

  const role = parseAiRole(payload.role);
  if (!role) return null;
  if (role === AI_ROLE.ASSISTANT && payload.phase !== CODEX_FINAL_ANSWER_PHASE) return null;

  const parts = textBlocks(payload.content);
  const visibleParts = role === AI_ROLE.USER ? parts.filter((part) => !isInternalUserText(part)) : parts;
  const content = visibleParts.join('\n\n');
  return content ? { role, content } : null;
}

function sessionMetadata(records: unknown[]) {
  for (const value of records) {
    const record = asRecord(value);
    if (record?.type !== CODEX_RECORD_TYPE.SESSION_META) continue;
    return asRecord(record.payload);
  }
  return null;
}

interface CodexTokenUsagePayload {
  input_tokens?: number;
  output_tokens?: number;
  cached_input_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

function extractCodexTokenUsage(records: unknown[]): AiTokenUsage | undefined {
  const modelWeights = new Map<string, number>();
  const exactModelUsage = new Map<string, {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
  }>();

  let activeModel = '';
  let tokenUsage: CodexTokenUsagePayload | undefined;
  let hasExactRecords = false;

  for (const value of records) {
    const record = asRecord(value);
    if (!record) continue;

    if (record.type === CODEX_RECORD_TYPE.SESSION_META) {
      const payload = asRecord(record.payload);
      if (typeof payload?.model === 'string' && payload.model.trim()) {
        const m = payload.model.trim();
        if (!m.includes('<') && !m.includes('>')) {
          activeModel = m;
        }
      }
    } else if (record.type === 'turn_context') {
      const payload = asRecord(record.payload);
      if (typeof payload?.model === 'string' && payload.model.trim()) {
        const m = payload.model.trim();
        if (!m.includes('<') && !m.includes('>')) {
          activeModel = m;
        }
      }
    } else if (record.type === 'event_msg') {
      const payload = asRecord(record.payload);
      if (payload?.type === 'thread_settings_applied') {
        const threadSettings = asRecord(payload.thread_settings);
        if (typeof threadSettings?.model === 'string' && threadSettings.model.trim()) {
          const m = threadSettings.model.trim();
          if (!m.includes('<') && !m.includes('>')) {
            activeModel = m;
          }
        }
      } else if (payload?.type === 'token_count' && payload.info) {
        const info = asRecord(payload.info);
        const total = asRecord(info?.total_token_usage);
        if (total) {
          tokenUsage = {
            input_tokens: typeof total.input_tokens === 'number' ? total.input_tokens : undefined,
            output_tokens: typeof total.output_tokens === 'number' ? total.output_tokens : undefined,
            cached_input_tokens: typeof total.cached_input_tokens === 'number' ? total.cached_input_tokens : undefined,
            reasoning_output_tokens: typeof total.reasoning_output_tokens === 'number' ? total.reasoning_output_tokens : undefined,
            total_tokens: typeof total.total_tokens === 'number' ? total.total_tokens : undefined,
          };
        }
      }
    }

    if (record.type === 'token_usage_record') {
      const payload = asRecord(record.payload);
      const usage = asRecord(payload?.usage) || asRecord(payload?.turn_token_usage);
      if (usage && activeModel) {
        hasExactRecords = true;
        const current = exactModelUsage.get(activeModel) || {
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
        };
        current.inputTokens += Number(usage.input_tokens) || 0;
        current.outputTokens += Number(usage.output_tokens) || 0;
        current.cachedTokens += Number(usage.cached_input_tokens) || 0;
        current.reasoningTokens += Number(usage.reasoning_output_tokens) || 0;
        exactModelUsage.set(activeModel, current);
      }
    }

    if (activeModel) {
      const payload = asRecord(record.payload);
      let weight = 1;
      if (payload && Array.isArray(payload.content)) {
        const parts = textBlocks(payload.content);
        weight = Math.max(1, parts.join('').length);
      }
      modelWeights.set(activeModel, (modelWeights.get(activeModel) || 0) + weight);
    }
  }

  if (!tokenUsage && !hasExactRecords && modelWeights.size === 0) return undefined;

  const fallbackModel = activeModel || 'gpt-5.2';

  if (hasExactRecords && exactModelUsage.size > 0) {
    const byModel: ModelUsageDetail[] = [];
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;
    let totalReasoning = 0;
    let totalEstimatedCost = 0;

    for (const [m, u] of exactModelUsage.entries()) {
      const mTotal = u.inputTokens + u.outputTokens;
      totalInput += u.inputTokens;
      totalOutput += u.outputTokens;
      totalCached += u.cachedTokens;
      totalReasoning += u.reasoningTokens;

      const costResult = calculateTokenUsageCost({
        provider: 'openai',
        model: m,
        usage: {
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          cachedTokens: u.cachedTokens > 0 ? u.cachedTokens : undefined,
          reasoningTokens: u.reasoningTokens,
        },
      });

      totalEstimatedCost += costResult.cost;

      byModel.push({
        model: m,
        provider: AI_PROVIDER.CODEX_CLI,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        totalTokens: mTotal,
        reasoningTokens: u.reasoningTokens > 0 ? u.reasoningTokens : undefined,
        cachedTokens: u.cachedTokens > 0 ? u.cachedTokens : undefined,
        estimatedCostUsd: costResult.cost,
        rates: costResult.rates,
      });
    }

    byModel.sort((a, b) => b.totalTokens - a.totalTokens);
    const primary = byModel[0];

    return {
      provider: AI_PROVIDER.CODEX_CLI,
      model: primary?.model || fallbackModel,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      reasoningTokens: totalReasoning > 0 ? totalReasoning : undefined,
      cachedTokens: totalCached > 0 ? totalCached : undefined,
      estimatedCostUsd: Number(totalEstimatedCost.toFixed(6)),
      rates: primary?.rates,
      byModel: byModel.length > 0 ? byModel : undefined,
    };
  }

  if (modelWeights.size === 0) {
    modelWeights.set(fallbackModel, 1);
  }

  const inputTokens = Number(tokenUsage?.input_tokens) || 0;
  const outputTokens = Number(tokenUsage?.output_tokens) || 0;
  const totalTokens = Number(tokenUsage?.total_tokens) || (inputTokens + outputTokens);
  const cachedTokens = typeof tokenUsage?.cached_input_tokens === 'number' ? tokenUsage.cached_input_tokens : 0;
  const reasoningTokens = typeof tokenUsage?.reasoning_output_tokens === 'number' ? tokenUsage.reasoning_output_tokens : undefined;

  const totalWeight = Array.from(modelWeights.values()).reduce((sum, w) => sum + w, 0);
  const byModel: ModelUsageDetail[] = [];
  let totalEstimatedCost = 0;

  const entries = Array.from(modelWeights.entries());
  let allocatedInput = 0;
  let allocatedOutput = 0;
  let allocatedCached = 0;

  const allocatedList: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
    weight: number;
  }> = [];

  for (const [m, weight] of entries) {
    const ratio = totalWeight > 0 ? weight / totalWeight : 1 / entries.length;
    const mInput = Math.round(inputTokens * ratio);
    const mOutput = Math.round(outputTokens * ratio);
    const mCached = cachedTokens > 0 ? Math.round(cachedTokens * ratio) : 0;

    allocatedInput += mInput;
    allocatedOutput += mOutput;
    allocatedCached += mCached;

    allocatedList.push({
      model: m,
      inputTokens: mInput,
      outputTokens: mOutput,
      cachedTokens: mCached > 0 ? mCached : undefined,
      weight,
    });
  }

  allocatedList.sort((a, b) => b.weight - a.weight);
  if (allocatedList.length > 0) {
    allocatedList[0].inputTokens += inputTokens - allocatedInput;
    allocatedList[0].outputTokens += outputTokens - allocatedOutput;
    if (cachedTokens > 0) {
      allocatedList[0].cachedTokens = Math.max(0, (allocatedList[0].cachedTokens || 0) + (cachedTokens - allocatedCached)) || undefined;
    }
  }

  for (const item of allocatedList) {
    const costResult = calculateTokenUsageCost({
      provider: 'openai',
      model: item.model,
      usage: {
        inputTokens: item.inputTokens,
        outputTokens: item.outputTokens,
        cachedTokens: item.cachedTokens,
        reasoningTokens,
      },
    });

    totalEstimatedCost += costResult.cost;

    byModel.push({
      model: item.model,
      provider: AI_PROVIDER.CODEX_CLI,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      totalTokens: item.inputTokens + item.outputTokens,
      reasoningTokens,
      cachedTokens: item.cachedTokens,
      estimatedCostUsd: costResult.cost,
      rates: costResult.rates,
    });
  }

  byModel.sort((a, b) => b.totalTokens - a.totalTokens);
  const primary = byModel[0];

  return {
    provider: AI_PROVIDER.CODEX_CLI,
    model: primary?.model || fallbackModel,
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
    estimatedCostUsd: Number(totalEstimatedCost.toFixed(6)),
    rates: primary?.rates,
    byModel: byModel.length > 0 ? byModel : undefined,
  };
}

function parseFile(filePath: string): AiSession | null {
  try {
    const records = readJsonLines(fs.readFileSync(filePath, 'utf8'));
    const turns = records.map(parseTurn).filter((turn): turn is AiTurn => turn !== null);
    if (turns.length === 0) return null;

    const metadata = sessionMetadata(records);
    const cwd = typeof metadata?.cwd === 'string' ? metadata.cwd : '';
    const sessionId = typeof metadata?.id === 'string' ? metadata.id : path.basename(filePath, JSONL_EXTENSION);
    const internalTimestamp = latestRecordTimestamp(records, ['timestamp', 'created_at', 'updated_at']);
    const timestamp = internalTimestamp ?? safeMtime(filePath);

    return {
      providerId: AI_PROVIDER.CODEX_CLI,
      sessionId,
      title: buildSessionTitle(AI_PROVIDER_NAME[AI_PROVIDER.CODEX_CLI], turns),
      turns,
      timestamp,
      timestampIsInternal: internalTimestamp !== null,
      projectSlug: cwd ? resolveProjectSlugFromDir(cwd) : undefined,
      tokenUsage: extractCodexTokenUsage(records),
    };
  } catch {
    return null;
  }
}

export class CodexHistoryProvider implements AiHistoryProvider {
  readonly id = AI_PROVIDER.CODEX_CLI;
  readonly name = AI_PROVIDER_NAME[this.id];

  private getHistoryDir(): string {
    const config = vscode.workspace.getConfiguration(AI_HISTORY_CONFIG.SECTION);
    return config.get<string>(AI_HISTORY_CONFIG.CODEX_LOG_PATH) || path.join(os.homedir(), ...AI_SESSION_PATH.CODEX_CLI);
  }

  async isEnabled(): Promise<boolean> {
    return fs.existsSync(this.getHistoryDir());
  }

  getSourceMtime(): number {
    const historyDir = this.getHistoryDir();
    // Codex stores rollouts under date directories. Updating a rollout changes
    // the JSONL file's mtime, but not the root sessions directory's mtime.
    // Tracking that root directory therefore makes the poller permanently skip
    // new turns after its first scan.
    const latestRollout = recentFiles(historyDir, (filePath) => filePath.endsWith(JSONL_EXTENSION), 1)[0];
    return Math.max(safeMtime(historyDir), safeMtime(latestRollout || historyDir));
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

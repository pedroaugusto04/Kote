import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from '../../config.js';
import { resolveProjectSlugFromDir } from '../../utils/project-detector.js';
import {
  AI_PROVIDER,
  AI_PROVIDER_NAME,
  AI_ROLE,
  AI_SESSION_PATH,
  CODEX_FINAL_ANSWER_PHASE,
  CODEX_INTERNAL_USER_PREFIXES,
  JSONL_EXTENSION,
} from '../constants.js';
import type { AiHistoryProvider, AiSession, AiTurn, AiTokenUsage, ModelUsageDetail } from '../types.js';
import { calculateSessionCostWithRateSync } from '../pricing.js';
import { asRecord, buildSessionTitle, isSession, parseAiRole, readJsonLines, recentFiles, safeMtime } from './provider.utils.js';

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
  let model = '';
  let tokenUsage: CodexTokenUsagePayload | undefined;

  for (const value of records) {
    const record = asRecord(value);
    if (!record) continue;

    if (record.type === 'turn_context') {
      const payload = asRecord(record.payload);
      if (typeof payload?.model === 'string' && payload.model) {
        model = payload.model;
      }
    } else if (record.type === 'event_msg') {
      const payload = asRecord(record.payload);
      if (payload?.type === 'token_count' && payload.info) {
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
  }

  if (!tokenUsage && !model) return undefined;

  const inputTokens = Number(tokenUsage?.input_tokens) || 0;
  const outputTokens = Number(tokenUsage?.output_tokens) || 0;
  const totalTokens = Number(tokenUsage?.total_tokens) || (inputTokens + outputTokens);
  const cachedTokens = typeof tokenUsage?.cached_input_tokens === 'number' ? tokenUsage.cached_input_tokens : undefined;
  const reasoningTokens = typeof tokenUsage?.reasoning_output_tokens === 'number' ? tokenUsage.reasoning_output_tokens : undefined;
  const resolvedModel = model || 'gpt-5.2';

  const costResult = calculateSessionCostWithRateSync({
    provider: 'openai',
    model: resolvedModel,
    inputTokens,
    outputTokens,
    cachedTokens,
  });

  const detail: ModelUsageDetail = {
    model: resolvedModel,
    provider: AI_PROVIDER.CODEX_CLI,
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cachedTokens,
    estimatedCostUsd: costResult.cost,
    rates: costResult.rates,
  };

  return {
    provider: AI_PROVIDER.CODEX_CLI,
    model: resolvedModel,
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cachedTokens,
    estimatedCostUsd: costResult.cost,
    rates: costResult.rates,
    byModel: [detail],
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
    const tokenUsage = extractCodexTokenUsage(records);

    return {
      providerId: AI_PROVIDER.CODEX_CLI,
      sessionId,
      title: buildSessionTitle(AI_PROVIDER_NAME[AI_PROVIDER.CODEX_CLI], turns),
      turns,
      timestamp: safeMtime(filePath),
      projectSlug: cwd ? resolveProjectSlugFromDir(cwd) : undefined,
      tokenUsage,
    };
  } catch {
    return null;
  }
}

export class CodexHistoryProvider implements AiHistoryProvider {
  readonly id = AI_PROVIDER.CODEX_CLI;
  readonly name = AI_PROVIDER_NAME[this.id];

  async getRecentSessions(limit?: number): Promise<AiSession[]> {
    const config = loadConfig();
    const historyDir = config.aiProviders?.codexLogPath || path.join(os.homedir(), ...AI_SESSION_PATH.CODEX_CLI);
    return recentFiles(historyDir, (filePath) => filePath.endsWith(JSONL_EXTENSION), limit).map(parseFile).filter(isSession);
  }
}

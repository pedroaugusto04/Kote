import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from '../../config.js';
import { resolveProjectSlugFromDir } from '../../utils/project-detector.js';
import { toUrlSlug } from '../../utils/text.js';
import { AI_PROVIDER, AI_PROVIDER_NAME, AI_SESSION_PATH, JSONL_EXTENSION } from '../constants.js';
import type { AiHistoryProvider, AiSession, AiTurn, AiTokenUsage } from '../types.js';
import { calculateSessionCostWithRateSync } from '../pricing.js';
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
  let model = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  for (const value of records) {
    const record = asRecord(value);
    if (!record || record.type !== CLAUDE_RECORD_TYPE.ASSISTANT) continue;
    const message = asRecord(record.message);
    if (!message) continue;

    if (typeof message.model === 'string' && message.model) {
      model = message.model;
    }

    const usage = asRecord(message.usage);
    if (usage) {
      if (typeof usage.input_tokens === 'number') inputTokens += usage.input_tokens;
      if (typeof usage.output_tokens === 'number') outputTokens += usage.output_tokens;
      if (typeof usage.cache_read_input_tokens === 'number') cachedTokens += usage.cache_read_input_tokens;
    }
  }

  if (!model && inputTokens === 0 && outputTokens === 0) return undefined;
  const resolvedModel = model || 'claude-3-5-sonnet';

  const costResult = calculateSessionCostWithRateSync({
    provider: 'anthropic',
    model: resolvedModel,
    inputTokens,
    outputTokens,
    cachedTokens,
  });

  return {
    provider: AI_PROVIDER.CLAUDE_CODE,
    model: resolvedModel,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
    estimatedCostUsd: costResult.cost,
    rates: costResult.rates,
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

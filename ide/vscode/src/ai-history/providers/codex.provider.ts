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
import type { AiHistoryProvider, AiSession, AiTurn, AiTokenUsage } from '../types';
import { asRecord, buildSessionTitle, latestRecordTimestamp, parseAiRole, readJsonLines, recentFiles, safeMtime } from './provider.utils';
import { calculateSessionCostWithRateSync } from '../pricing';

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

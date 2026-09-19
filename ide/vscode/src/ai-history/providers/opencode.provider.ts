import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { watchFile } from '../../utils/watcher.js';
import {
  AI_HISTORY_CONFIG,
  AI_PROVIDER,
  AI_PROVIDER_NAME,
  AI_ROLE,
  AI_SESSION_DATABASE_DEBOUNCE_MS,
  AI_SESSION_PATH,
  AI_TEXT_CONTENT_TYPE,
  DEFAULT_AI_SESSION_LIMIT,
  OPEN_CODE_FINAL_FINISH,
} from '../constants';
import type { AiHistoryProvider, AiSession, AiTurn } from '../types';
import { asRecord, keepFinalAssistantTurns, parseAiRole, safeMtime, toTimestampMs } from './provider.utils';
import { calculateSessionCostWithRateSync } from '../pricing';

interface OpenCodeRow {
  sessionId: string;
  title?: string;
  timestamp: string | number;
  projectSlug?: string;
  messageId?: string;
  messageData?: string;
  partData?: string;
}

interface SessionAccumulator {
  session: AiSession;
  messages: Map<string, { role: AiTurn['role']; textParts: string[] }>;
  modelID?: string;
  providerID?: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  cost: number;
}

function addRow(sessions: Map<string, SessionAccumulator>, row: OpenCodeRow): void {
  let accumulator = sessions.get(row.sessionId);
  if (!accumulator) {
    const internalTimestamp = toTimestampMs(row.timestamp);
    accumulator = {
      session: {
        providerId: AI_PROVIDER.OPEN_CODE,
        sessionId: row.sessionId,
        title: row.title || `${AI_PROVIDER_NAME[AI_PROVIDER.OPEN_CODE]} Session`,
        turns: [],
        timestamp: internalTimestamp ?? 0,
        timestampIsInternal: internalTimestamp !== null,
        projectSlug: row.projectSlug || undefined,
      },
      messages: new Map(),
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedTokens: 0,
      cost: 0,
    };
    sessions.set(row.sessionId, accumulator);
  }

  if (!row.messageId || !row.messageData) return;
  const message = asRecord(JSON.parse(row.messageData));
  const role = parseAiRole(message?.role);
  if (!role) return;

  // Track model and tokens from assistant messages
  if (role === AI_ROLE.ASSISTANT) {
    if (typeof message?.modelID === 'string' && message.modelID) {
      accumulator.modelID = message.modelID;
    }
    if (typeof message?.providerID === 'string' && message.providerID) {
      accumulator.providerID = message.providerID;
    }
    if (typeof message?.cost === 'number' && Number.isFinite(message.cost)) {
      accumulator.cost += message.cost;
    }
    const tokens = asRecord(message?.tokens);
    if (tokens) {
      if (typeof tokens.input === 'number') accumulator.inputTokens += tokens.input;
      if (typeof tokens.output === 'number') accumulator.outputTokens += tokens.output;
      if (typeof tokens.reasoning === 'number') accumulator.reasoningTokens += tokens.reasoning;
      const cache = asRecord(tokens.cache);
      if (typeof cache?.read === 'number') accumulator.cachedTokens += cache.read;
    }
  }

  if (role === AI_ROLE.ASSISTANT && message?.finish !== OPEN_CODE_FINAL_FINISH) return;

  let entry = accumulator.messages.get(row.messageId);
  if (!entry) {
    entry = { role, textParts: [] };
    accumulator.messages.set(row.messageId, entry);
  }

  if (!row.partData) return;
  const part = asRecord(JSON.parse(row.partData));
  if (part?.type !== AI_TEXT_CONTENT_TYPE || typeof part.text !== 'string') return;
  entry.textParts.push(part.text);
}

function finalizeSessions(accumulators: Map<string, SessionAccumulator>): AiSession[] {
  const sessions: AiSession[] = [];
  for (const acc of accumulators.values()) {
    const { session, messages, modelID, providerID, inputTokens, outputTokens, reasoningTokens, cachedTokens, cost } = acc;
    const parsedTurns = [...messages.values()]
      .map(({ role, textParts }) => ({ role, content: textParts.join('\n\n').trim() }))
      .filter((turn) => turn.content);
    session.turns = keepFinalAssistantTurns(parsedTurns);

    if (modelID || inputTokens > 0 || outputTokens > 0) {
      const resolvedModel = modelID || 'unknown';
      const costResult = calculateSessionCostWithRateSync({
        provider: providerID || 'opencode',
        model: resolvedModel,
        inputTokens,
        outputTokens,
        cachedTokens,
        nativeCost: cost > 0 ? cost : undefined,
      });

      session.tokenUsage = {
        provider: providerID || AI_PROVIDER.OPEN_CODE,
        model: resolvedModel,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        reasoningTokens: reasoningTokens > 0 ? reasoningTokens : undefined,
        cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
        estimatedCostUsd: costResult.cost,
        rates: costResult.rates,
      };
    }

    if (session.turns.length > 0) sessions.push(session);
  }
  return sessions;
}

export class OpenCodeHistoryProvider implements AiHistoryProvider {
  readonly id = AI_PROVIDER.OPEN_CODE;
  readonly name = AI_PROVIDER_NAME[this.id];

  private getDbPath(): string {
    const config = vscode.workspace.getConfiguration(AI_HISTORY_CONFIG.SECTION);
    const configured = config.get<string>(AI_HISTORY_CONFIG.OPEN_CODE_DB_PATH);
    if (configured) return configured;

    const standard = path.join(os.homedir(), ...AI_SESSION_PATH.OPEN_CODE);
    if (fs.existsSync(standard)) return standard;
    return path.join(os.homedir(), ...AI_SESSION_PATH.OPEN_CODE_PROD);
  }

  async isEnabled(): Promise<boolean> {
    if (!fs.existsSync(this.getDbPath())) return false;
    try {
      const sqlite = await import('node:sqlite');
      return Boolean(sqlite.DatabaseSync);
    } catch {
      return false;
    }
  }

  getSourceMtime(): number {
    return safeMtime(this.getDbPath());
  }

  async getRecentSessions(limit = DEFAULT_AI_SESSION_LIMIT): Promise<AiSession[]> {
    const dbPath = this.getDbPath();
    if (!fs.existsSync(dbPath)) return [];

    try {
      const { DatabaseSync } = await import('node:sqlite');
      if (!DatabaseSync) return [];
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const safeLimit = Math.max(0, Math.floor(limit));
      const rows = db.prepare(`
        SELECT
          s.id as sessionId,
          s.title,
          s.time_updated as timestamp,
          s.slug as projectSlug,
          m.id as messageId,
          m.data as messageData,
          p.data as partData
        FROM (SELECT * FROM session ORDER BY time_updated DESC LIMIT ${safeLimit}) s
        JOIN message m ON m.session_id = s.id
        LEFT JOIN part p ON p.message_id = m.id
        ORDER BY s.time_updated DESC, m.time_created ASC, p.time_created ASC
      `).all() as unknown as OpenCodeRow[];
      db.close();

      const accumulators = new Map<string, SessionAccumulator>();
      for (const row of rows) {
        try {
          addRow(accumulators, row);
        } catch {
          // Ignore malformed message or part JSON without losing the session.
        }
      }
      return finalizeSessions(accumulators);
    } catch {
      return [];
    }
  }

  watchSessions(callback: (session: AiSession) => void): vscode.Disposable {
    const dbPath = this.getDbPath();
    let timeout: NodeJS.Timeout | undefined;
    const watcher = watchFile(dbPath, () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(async () => {
        timeout = undefined;
        const [session] = await this.getRecentSessions(1);
        if (session) callback(session);
      }, AI_SESSION_DATABASE_DEBOUNCE_MS);
    });

    return new vscode.Disposable(() => {
      if (timeout) clearTimeout(timeout);
      watcher.dispose();
    });
  }
}

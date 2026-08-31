import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from '../../config.js';
import { AI_PROVIDER, AI_PROVIDER_NAME, AI_ROLE, AI_SESSION_PATH, AI_TEXT_CONTENT_TYPE, OPEN_CODE_FINAL_FINISH } from '../constants.js';
import type { AiHistoryProvider, AiSession, AiTurn } from '../types.js';
import { asRecord, keepFinalAssistantTurns, parseAiRole } from './provider.utils.js';

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
}

function databasePath(): string {
  const configured = loadConfig().aiProviders?.opencodeDbPath;
  if (configured) return configured;

  const standard = path.join(os.homedir(), ...AI_SESSION_PATH.OPEN_CODE);
  if (fs.existsSync(standard)) return standard;
  return path.join(os.homedir(), ...AI_SESSION_PATH.OPEN_CODE_PROD);
}

function addRow(sessions: Map<string, SessionAccumulator>, row: OpenCodeRow): void {
  let accumulator = sessions.get(row.sessionId);
  if (!accumulator) {
    accumulator = {
      session: {
        providerId: AI_PROVIDER.OPEN_CODE,
        sessionId: row.sessionId,
        title: row.title || `${AI_PROVIDER_NAME[AI_PROVIDER.OPEN_CODE]} Session`,
        turns: [],
        timestamp: Number(row.timestamp),
        projectSlug: row.projectSlug || undefined,
      },
      messages: new Map(),
    };
    sessions.set(row.sessionId, accumulator);
  }

  if (!row.messageId || !row.messageData) return;
  const message = asRecord(JSON.parse(row.messageData));
  const role = parseAiRole(message?.role);
  if (!role) return;
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
  for (const { session, messages } of accumulators.values()) {
    const parsedTurns = [...messages.values()]
      .map(({ role, textParts }) => ({ role, content: textParts.join('\n\n').trim() }))
      .filter((turn) => turn.content);
    session.turns = keepFinalAssistantTurns(parsedTurns);
    if (session.turns.length > 0) sessions.push(session);
  }
  return sessions;
}

export class OpenCodeHistoryProvider implements AiHistoryProvider {
  readonly id = AI_PROVIDER.OPEN_CODE;
  readonly name = AI_PROVIDER_NAME[this.id];

  async getRecentSessions(limit?: number): Promise<AiSession[]> {
    const dbPath = databasePath();
    if (!fs.existsSync(dbPath)) return [];

    try {
      const { DatabaseSync } = await import('node:sqlite');
      if (!DatabaseSync) return [];
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const safeLimit = typeof limit === 'number' ? Math.max(0, Math.floor(limit)) : null;
      const sessionSource = safeLimit === null
        ? 'session'
        : `(SELECT * FROM session ORDER BY time_updated DESC LIMIT ${safeLimit})`;
      const rows = db.prepare(`
        SELECT
          s.id as sessionId,
          s.title,
          s.time_updated as timestamp,
          s.slug as projectSlug,
          m.id as messageId,
          m.data as messageData,
          p.data as partData
        FROM ${sessionSource} s
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
}

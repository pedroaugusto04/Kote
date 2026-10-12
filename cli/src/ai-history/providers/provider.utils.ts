import fs from 'node:fs';
import path from 'node:path';

import { AI_ROLE, AI_TEXT_CONTENT_TYPE, type AiRole } from '../constants.js';
import type { AiSession, AiTurn } from '../types.js';
import { collapseWhitespace } from '../../utils/text.js';

export type JsonRecord = Record<string, unknown>;

const MAX_SESSION_CACHE_ENTRIES = 250;

export function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' ? value as JsonRecord : null;
}

export function parseAiRole(value: unknown): AiRole | null {
  if (value === AI_ROLE.USER || value === AI_ROLE.ASSISTANT) return value;
  return null;
}

export function extractTextContent(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';

  const parts: string[] = [];
  for (const candidate of value) {
    const block = asRecord(candidate);
    if (block?.type !== AI_TEXT_CONTENT_TYPE || typeof block.text !== 'string') continue;
    const text = block.text.trim();
    if (text) parts.push(text);
  }
  return parts.join('\n\n');
}

export function readJsonLines(content: string): unknown[] {
  const records: unknown[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // Ignore incomplete lines while a session is still being written.
    }
  }
  return records;
}

export function listFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...listFilesRecursively(entryPath));
        continue;
      }
      files.push(entryPath);
    }
  } catch {
    return files;
  }
  return files;
}

export function recentFiles(dir: string, predicate: (filePath: string) => boolean, limit?: number): string[] {
  const files = listFilesRecursively(dir)
    .filter(predicate)
    .map((filePath) => ({ filePath, timestamp: safeMtime(filePath) }))
    .sort((left, right) => right.timestamp - left.timestamp);

  return typeof limit === 'number' ? files.slice(0, Math.max(0, limit)).map(({ filePath }) => filePath) : files.map(({ filePath }) => filePath);
}

export function safeMtime(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

export function safeFileSignature(filePath: string): { signature: string; mtimeMs: number } | null {
  try {
    const stat = fs.statSync(filePath);
    return {
      signature: `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

export function cloneSession(session: AiSession): AiSession {
  return {
    ...session,
    turns: session.turns.map((turn) => ({ ...turn })),
    attachments: session.attachments
      ? session.attachments.map((att) => ({ ...att }))
      : undefined,
    tokenUsage: session.tokenUsage
      ? {
          ...session.tokenUsage,
          rates: session.tokenUsage.rates ? { ...session.tokenUsage.rates } : undefined,
          byModel: session.tokenUsage.byModel
            ? session.tokenUsage.byModel.map((m) => ({
                ...m,
                rates: m.rates ? { ...m.rates } : undefined,
              }))
            : undefined,
        }
      : undefined,
  };
}

export class FileSessionCache {
  private readonly cache = new Map<string, { signature: string; session: AiSession | null }>();

  getOrParse(
    key: string,
    signature: string | null,
    parser: () => AiSession | null,
  ): AiSession | null {
    if (!signature) {
      this.cache.delete(key);
      return null;
    }

    const existing = this.cache.get(key);
    if (existing && existing.signature === signature) {
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing.session ? cloneSession(existing.session) : null;
    }

    const parsed = parser();
    if (this.cache.size >= MAX_SESSION_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      signature,
      session: parsed ? cloneSession(parsed) : null,
    });

    return parsed;
  }
}

export function buildSessionTitle(providerName: string, turns: AiTurn[]): string {
  const firstUserTurn = turns.find((turn) => turn.role === AI_ROLE.USER);
  const prompt = collapseWhitespace(firstUserTurn?.content || '');
  if (!prompt) return `${providerName} Session`;
  return `${providerName}: ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}`;
}

export function keepFinalAssistantTurns(candidates: AiTurn[]): AiTurn[] {
  const turns: AiTurn[] = [];
  let pendingAssistant: AiTurn | null = null;

  for (const turn of candidates) {
    if (turn.role === AI_ROLE.ASSISTANT) {
      if (turns.length > 0) pendingAssistant = turn;
      continue;
    }

    if (pendingAssistant) turns.push(pendingAssistant);
    turns.push(turn);
    pendingAssistant = null;
  }

  if (pendingAssistant) turns.push(pendingAssistant);
  return turns;
}

export function isSession(value: AiSession | null): value is AiSession {
  return value !== null;
}

export function toTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value.trim());
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export function latestRecordTimestamp(records: unknown[], fallbackMs: number): number {
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = asRecord(records[i]);
    if (!rec) continue;
    const ts = toTimestampMs(rec.created_at || rec.timestamp || rec.createdAt || rec.time);
    if (ts !== null) return ts;
  }
  return fallbackMs;
}

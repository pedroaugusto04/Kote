import * as fs from 'fs';
import * as path from 'path';

import { AI_ROLE, AI_TEXT_CONTENT_TYPE } from '../constants';
import type { AiRole } from '../constants';
import type { AiTurn } from '../types';
import { collapseWhitespace } from '../../utils/text.js';

export type JsonRecord = Record<string, unknown>;

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

export function recentFiles(dir: string, predicate: (filePath: string) => boolean, limit: number): string[] {
  return listFilesRecursively(dir)
    .filter(predicate)
    .map((filePath) => ({ filePath, timestamp: safeMtime(filePath) }))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, Math.max(0, limit))
    .map(({ filePath }) => filePath);
}

export function safeMtime(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
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

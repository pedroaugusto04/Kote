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
import type { AiHistoryProvider, AiSession, AiTurn } from '../types.js';
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

function parseFile(filePath: string): AiSession | null {
  try {
    const records = readJsonLines(fs.readFileSync(filePath, 'utf8'));
    const turns = records.map(parseTurn).filter((turn): turn is AiTurn => turn !== null);
    if (turns.length === 0) return null;

    const metadata = sessionMetadata(records);
    const cwd = typeof metadata?.cwd === 'string' ? metadata.cwd : '';
    const sessionId = typeof metadata?.id === 'string' ? metadata.id : path.basename(filePath, JSONL_EXTENSION);

    return {
      providerId: AI_PROVIDER.CODEX_CLI,
      sessionId,
      title: buildSessionTitle(AI_PROVIDER_NAME[AI_PROVIDER.CODEX_CLI], turns),
      turns,
      timestamp: safeMtime(filePath),
      projectSlug: cwd ? resolveProjectSlugFromDir(cwd) : undefined,
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

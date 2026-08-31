import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from '../../config.js';
import { resolveProjectSlugFromDir } from '../../utils/project-detector.js';
import { toUrlSlug } from '../../utils/text.js';
import { AI_PROVIDER, AI_PROVIDER_NAME, AI_SESSION_PATH, JSONL_EXTENSION } from '../constants.js';
import type { AiHistoryProvider, AiSession, AiTurn } from '../types.js';
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

function parseFile(filePath: string): AiSession | null {
  try {
    const turns = parseTurns(readJsonLines(fs.readFileSync(filePath, 'utf8')));
    if (turns.length === 0) return null;

    return {
      providerId: AI_PROVIDER.CLAUDE_CODE,
      sessionId: path.basename(filePath, JSONL_EXTENSION),
      title: buildSessionTitle(AI_PROVIDER_NAME[AI_PROVIDER.CLAUDE_CODE], turns),
      turns,
      timestamp: safeMtime(filePath),
      projectSlug: resolveProjectSlug(filePath),
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

import * as fs from 'fs';
import * as path from 'path';

import { AI_ROLE, AI_TEXT_CONTENT_TYPE } from '../constants';
import type { AiRole } from '../constants';
import type { AiSession, AiSessionGitActivity, AiTurn } from '../types';
import { collapseWhitespace } from '../../utils/text.js';

export type JsonRecord = Record<string, unknown>;

const MAX_SESSION_CACHE_ENTRIES = 250;

export function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' ? value as JsonRecord : null;
}

export function toTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== 'string') return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim() !== '') {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function latestRecordTimestamp(records: unknown[], fields: readonly string[]): number | null {
  let latest: number | null = null;
  for (const value of records) {
    const record = asRecord(value);
    const payload = asRecord(record?.payload);
    for (const field of fields) {
      const timestamp = toTimestampMs(record?.[field] ?? payload?.[field]);
      if (timestamp !== null && (latest === null || timestamp > latest)) {
        latest = timestamp;
      }
    }
  }
  return latest;
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

export function latestTreeMtime(dir: string, predicate: (filePath: string) => boolean): number {
  let maxMtime = safeMtime(dir);
  if (maxMtime === 0) return 0;

  const walk = (currentDir: string) => {
    try {
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const entryPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(entryPath);
        } else if (entry.isFile() && predicate(entryPath)) {
          const mtime = safeMtime(entryPath);
          if (mtime > maxMtime) {
            maxMtime = mtime;
          }
        }
      }
    } catch {
      // Ignore transient permission or removal errors during traversal
    }
  };

  walk(dir);
  return maxMtime;
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
    gitActivity: session.gitActivity
      ? {
          ...session.gitActivity,
          createdCommitShas: session.gitActivity.createdCommitShas ? [...session.gitActivity.createdCommitShas] : undefined,
          touchedFiles: session.gitActivity.touchedFiles ? [...session.gitActivity.touchedFiles] : undefined,
        }
      : undefined,
  };
}

const GIT_COMMIT_OUTPUT_REGEX = /\[([\w./-]+)(?:\s+\(root-commit\))?\s+([0-9a-f]{7,40})\]\s+[^\n\r"]+/g;
const APPLY_PATCH_FILE_REGEX = /\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+([^\n\r"]+)/g;
const WRITE_TOOL_NAMES = new Set([
  'edit',
  'write',
  'multiedit',
  'edit_file',
  'write_file',
  'replace_file_content',
  'multi_replace_file_content',
  'apply_patch',
  'create_file',
]);

function normalizeSessionFilePath(rawPath: string, workspaceDir?: string | null): string | null {
  const cleaned = rawPath.trim().replace(/\\/g, '/');
  if (!cleaned || cleaned.includes('/.gemini/') || cleaned.includes('/.claude/') || cleaned.includes('/node_modules/')) {
    return null;
  }
  if (workspaceDir) {
    const normWs = workspaceDir.replace(/\\/g, '/').replace(/\/$/, '');
    if (cleaned.startsWith(normWs + '/')) {
      return cleaned.slice(normWs.length + 1);
    }
  }
  if (!cleaned.startsWith('/')) {
    return cleaned.replace(/^\.\//, '');
  }
  return cleaned.replace(/^\/+/, '');
}

export function extractGitActivityFromRecords(
  records: unknown[],
  workspaceDir?: string | null,
): AiSessionGitActivity | undefined {
  const touchedFiles = new Set<string>();
  const createdCommitShas = new Set<string>();
  let detectedBranch: string | undefined;
  let detectedCwd = workspaceDir || undefined;

  const inspectObject = (obj: unknown, inWriteTool = false) => {
    if (!obj) return;
    if (typeof obj === 'string') {
      if (obj.includes('[')) {
        for (const match of obj.matchAll(GIT_COMMIT_OUTPUT_REGEX)) {
          const branch = match[1];
          const sha = match[2]?.toLowerCase();
          if (sha && /^[0-9a-f]{7,40}$/.test(sha)) {
            createdCommitShas.add(sha);
            if (branch && !detectedBranch) detectedBranch = branch;
          }
        }
      }
      if (obj.includes('*** ')) {
        for (const match of obj.matchAll(APPLY_PATCH_FILE_REGEX)) {
          const normalized = normalizeSessionFilePath(match[1], detectedCwd);
          if (normalized) touchedFiles.add(normalized);
        }
      }
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) inspectObject(item, inWriteTool);
      return;
    }

    const rec = asRecord(obj);
    if (!rec) return;

    if (!detectedCwd && typeof rec.cwd === 'string' && rec.cwd.startsWith('/')) {
      detectedCwd = rec.cwd;
    }
    if (!detectedBranch && typeof rec.gitBranch === 'string' && rec.gitBranch.trim()) {
      detectedBranch = rec.gitBranch.trim();
    }

    const toolName = typeof rec.name === 'string'
      ? rec.name.toLowerCase()
      : typeof rec.tool === 'string'
        ? rec.tool.toLowerCase()
        : '';
    const isWriteTool = inWriteTool || WRITE_TOOL_NAMES.has(toolName);

    if (isWriteTool) {
      for (const key of ['file_path', 'filePath', 'Path', 'target_file', 'path']) {
        const candidate = rec[key];
        if (typeof candidate === 'string' && candidate.trim()) {
          const normalized = normalizeSessionFilePath(candidate, detectedCwd);
          if (normalized) touchedFiles.add(normalized);
        }
      }
    }

    for (const val of Object.values(rec)) {
      if (typeof val === 'string' || typeof val === 'object') {
        inspectObject(val, isWriteTool);
      }
    }
  };

  inspectObject(records, false);

  if (touchedFiles.size === 0 && createdCommitShas.size === 0 && !detectedBranch && !detectedCwd) {
    return undefined;
  }

  return {
    ...(detectedCwd ? { cwd: detectedCwd } : {}),
    ...(detectedBranch ? { branch: detectedBranch } : {}),
    ...(createdCommitShas.size > 0 ? { createdCommitShas: [...createdCommitShas] } : {}),
    ...(touchedFiles.size > 0 ? { touchedFiles: [...touchedFiles] } : {}),
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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from '../../config.js';
import { resolveProjectSlugFromDir } from '../../utils/project-detector.js';
import { AI_PROVIDER, AI_PROVIDER_NAME, AI_ROLE, AI_SESSION_PATH, ANTIGRAVITY_LOG_FILES } from '../constants.js';
import type { AiHistoryProvider, AiSession, AiSessionAttachment, AiTurn, AiTokenUsage, ModelUsageDetail } from '../types.js';
import { calculateSessionCostWithRateSync } from '../pricing.js';
import { asRecord, buildSessionTitle, keepFinalAssistantTurns, readJsonLines, safeMtime } from './provider.utils.js';

const USER_REQUEST_REGEX = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/;

const ANTIGRAVITY_RECORD = {
  USER_SOURCE: 'USER_EXPLICIT',
  USER_INPUT: 'USER_INPUT',
  MODEL_SOURCE: 'MODEL',
  PLANNER_RESPONSE: 'PLANNER_RESPONSE',
} as const;

function cleanContent(raw: string): string {
  return raw
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?(<\/ADDITIONAL_METADATA>|$)/gi, '')
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?(<\/USER_SETTINGS_CHANGE>|$)/gi, '')
    .replace(/<EPHEMERAL_MESSAGE>[\s\S]*?(<\/EPHEMERAL_MESSAGE>|$)/gi, '')
    .replace(/<SYSTEM_MESSAGE>[\s\S]*?(<\/SYSTEM_MESSAGE>|$)/gi, '')
    .replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, '')
    .replace(/<truncated \d+ bytes?>/gi, '\n…')
    .trim();
}

function parseUserTurn(value: unknown): AiTurn | null {
  const record = asRecord(value);
  if (!record || typeof record.content !== 'string') return null;

  if (record.source !== ANTIGRAVITY_RECORD.USER_SOURCE || record.type !== ANTIGRAVITY_RECORD.USER_INPUT) return null;

  const match = record.content.match(USER_REQUEST_REGEX);
  const content = cleanContent(match?.[1] || record.content.replace(/^<USER_REQUEST>\s*/i, ''));
  return content ? { role: AI_ROLE.USER, content } : null;
}

function parseAssistantContent(value: unknown): string | null {
  const record = asRecord(value);
  if (record?.source !== ANTIGRAVITY_RECORD.MODEL_SOURCE || record.type !== ANTIGRAVITY_RECORD.PLANNER_RESPONSE) return null;
  if (typeof record.content !== 'string') return null;

  const content = cleanContent(record.content);
  return content || null;
}

function parseTurns(records: unknown[]): AiTurn[] {
  const candidates: AiTurn[] = [];

  for (const record of records) {
    const userTurn = parseUserTurn(record);
    if (userTurn) {
      candidates.push(userTurn);
      continue;
    }

    const assistantContent = parseAssistantContent(record);
    if (assistantContent) candidates.push({ role: AI_ROLE.ASSISTANT, content: assistantContent });
  }

  return keepFinalAssistantTurns(candidates);
}

function extractWorkspace(content: string): string | null {
  const userInfo = content.match(/<user_information>([\s\S]*?)<\/user_information>/i)?.[1] || content;
  const mappedPath = userInfo.match(/(?:^|\n)\s*(\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)\s*->/m)?.[1];
  if (mappedPath && fs.existsSync(mappedPath)) return mappedPath;

  const cwd = content.match(/"Cwd"\s*:\s*"([^"]+)"/)?.[1];
  if (cwd && fs.existsSync(cwd)) return cwd;

  const candidate = content.match(/"(?:AbsolutePath|DirectoryPath|SearchDirectory)"\s*:\s*"([^"]+)"/)?.[1];
  if (!candidate || !fs.existsSync(candidate)) return null;
  return fs.statSync(candidate).isDirectory() ? candidate : path.dirname(candidate);
}

function loadAttachments(sessionDir: string): AiSessionAttachment[] {
  try {
    return fs.readdirSync(sessionDir)
      .filter((fileName) => fileName.endsWith('.md'))
      .map((fileName) => {
        const filePath = path.join(sessionDir, fileName);
        const stat = fs.statSync(filePath);
        return stat.isFile() ? {
          fileName,
          mimeType: 'text/markdown',
          sizeBytes: stat.size,
          dataBase64: fs.readFileSync(filePath).toString('base64'),
        } : null;
      })
      .filter((attachment): attachment is AiSessionAttachment => attachment !== null);
  } catch {
    return [];
  }
}

function findLogFile(sessionDir: string): string | null {
  const candidates: { filePath: string; mtimeMs: number }[] = [];
  for (const fileName of ANTIGRAVITY_LOG_FILES) {
    const filePath = path.join(sessionDir, '.system_generated', 'logs', fileName);
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.size > 0) {
          candidates.push({ filePath, mtimeMs: stat.mtimeMs });
        }
      }
    } catch {
      // ignore transient stat errors
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].filePath;
}

function extractAntigravityModel(content: string): string {
  const settingsBlocks = [...content.matchAll(/<USER_SETTINGS_CHANGE>([\s\S]*?)<\/USER_SETTINGS_CHANGE>/gi)];
  for (let i = settingsBlocks.length - 1; i >= 0; i--) {
    const block = settingsBlocks[i][1];
    const match =
      block.match(/`Model Selection`\s+from\s+.*?\s+to\s+(.*?)(?:\.\s+No need|\.\s*$|\.\s*\n)/i) ||
      block.match(/`Model Selection`\s+from\s+.*?\s+to\s+([^\n]+)/i);
    if (match?.[1]) {
      let candidate = match[1].trim();
      candidate = candidate.replace(/\.\s*No need.*$/i, '').replace(/\.$/, '').trim();
      if (candidate && candidate.toLowerCase() !== 'none') {
        return candidate;
      }
    }
  }
  return 'Gemini 3.8 Flash (High)';
}

function extractAntigravityTokenUsage(sessionDir: string, content: string): AiTokenUsage | undefined {
  let model = extractAntigravityModel(content);
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  const candidateFiles = [
    path.join(sessionDir, 'token_usage.json'),
    path.join(sessionDir, 'statusline.json'),
    path.join(sessionDir, '.system_generated', 'token_usage.json'),
    path.join(os.homedir(), '.gemini', 'antigravity-cli', 'last_statusline.json'),
    path.join(os.homedir(), '.gemini', 'antigravity-ide', 'last_statusline.json'),
  ];

  for (const candidate of candidateFiles) {
    try {
      if (fs.existsSync(candidate)) {
        const data = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        const inTok = Number(data.context_window?.total_input_tokens ?? data.inputTokens ?? data.input_tokens);
        const outTok = Number(data.context_window?.total_output_tokens ?? data.outputTokens ?? data.output_tokens);
        const cacheTok = Number(data.context_window?.current_usage?.cache_read_input_tokens ?? data.cachedTokens ?? data.cached_tokens);
        const statusModel = typeof data.model === 'object' && data.model?.display_name ? String(data.model.display_name) : (typeof data.model?.id === 'string' ? String(data.model.id) : undefined);

        if (inTok > 0 || outTok > 0) {
          inputTokens = inTok;
          outputTokens = outTok;
          if (cacheTok > 0) cachedTokens = cacheTok;
          if (statusModel && statusModel.toLowerCase() !== 'none') {
            model = statusModel;
          }
          break;
        }
      }
    } catch {}
  }

  if (inputTokens === 0 && outputTokens === 0) return undefined;

  const totalTokens = inputTokens + outputTokens;
  const costResult = calculateSessionCostWithRateSync({
    provider: 'gemini',
    model,
    inputTokens,
    outputTokens,
    cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
  });

  const detail: ModelUsageDetail = {
    model,
    provider: AI_PROVIDER.ANTIGRAVITY,
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
    estimatedCostUsd: costResult.cost,
    rates: costResult.rates,
  };

  return {
    provider: AI_PROVIDER.ANTIGRAVITY,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
    estimatedCostUsd: costResult.cost,
    rates: costResult.rates,
    byModel: [detail],
  };
}

function parseSession(sessionDir: string, sessionId: string): AiSession | null {
  const logFile = findLogFile(sessionDir);
  if (!logFile) return null;

  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const turns = parseTurns(readJsonLines(content));
    if (turns.length === 0) return null;

    const workspace = extractWorkspace(content);
    const tokenUsage = extractAntigravityTokenUsage(sessionDir, content);

    return {
      providerId: AI_PROVIDER.ANTIGRAVITY,
      sessionId,
      title: buildSessionTitle(AI_PROVIDER_NAME[AI_PROVIDER.ANTIGRAVITY], turns),
      turns,
      timestamp: safeMtime(logFile),
      projectSlug: workspace ? resolveProjectSlugFromDir(workspace) : undefined,
      attachments: loadAttachments(sessionDir),
      tokenUsage,
    };
  } catch {
    return null;
  }
}

function historyDirectories(): string[] {
  const configPath = loadConfig().aiProviders?.antigravityLogPath;
  if (configPath) return [configPath];
  return [
    path.join(os.homedir(), ...AI_SESSION_PATH.ANTIGRAVITY_CLI),
    path.join(os.homedir(), ...AI_SESSION_PATH.ANTIGRAVITY_IDE),
  ];
}

export class AntigravityHistoryProvider implements AiHistoryProvider {
  readonly id = AI_PROVIDER.ANTIGRAVITY;
  readonly name = AI_PROVIDER_NAME[this.id];

  async getRecentSessions(limit?: number): Promise<AiSession[]> {
    const candidateDirs: { sessionDir: string; sessionId: string; mtime: number }[] = [];

    for (const historyDir of historyDirectories()) {
      if (!fs.existsSync(historyDir)) continue;
      let sessionIds: string[];
      try {
        sessionIds = fs.readdirSync(historyDir);
      } catch {
        continue;
      }
      for (const sessionId of sessionIds) {
        const sessionDir = path.join(historyDir, sessionId);
        try {
          const stat = fs.statSync(sessionDir);
          if (!stat.isDirectory()) continue;
          let mtime = stat.mtimeMs;
          for (const fileName of ANTIGRAVITY_LOG_FILES) {
            const logPath = path.join(sessionDir, '.system_generated', 'logs', fileName);
            try {
              if (fs.existsSync(logPath)) {
                const logStat = fs.statSync(logPath);
                if (logStat.mtimeMs > mtime) {
                  mtime = logStat.mtimeMs;
                }
              }
            } catch {
              // ignore stat errors
            }
          }
          candidateDirs.push({ sessionDir, sessionId, mtime });
        } catch {
          continue;
        }
      }
    }

    candidateDirs.sort((left, right) => right.mtime - left.mtime);

    const targetLimit = typeof limit === 'number' ? Math.max(0, limit) : candidateDirs.length;
    const sessions: AiSession[] = [];
    const seenSessionIds = new Set<string>();

    for (const candidate of candidateDirs) {
      if (seenSessionIds.has(candidate.sessionId)) continue;
      seenSessionIds.add(candidate.sessionId);

      const session = parseSession(candidate.sessionDir, candidate.sessionId);
      if (session) {
        sessions.push(session);
        if (sessions.length >= targetLimit) {
          break;
        }
      }
    }

    return sessions;
  }
}

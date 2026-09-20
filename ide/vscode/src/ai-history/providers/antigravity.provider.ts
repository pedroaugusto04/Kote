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
  ANTIGRAVITY_LOG_FILES,
  DEFAULT_AI_SESSION_LIMIT,
} from '../constants';
import type { AiHistoryProvider, AiSession, AiSessionAttachment, AiTurn, AiTokenUsage, ModelUsageDetail } from '../types';
import { asRecord, buildSessionTitle, keepFinalAssistantTurns, latestRecordTimestamp, readJsonLines, safeMtime } from './provider.utils';
import { calculateTokenUsageCost } from '../token-accounting';

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

interface AntigravityModelTransition {
  from?: string;
  to: string;
}

function parseModelChanges(text: string): AntigravityModelTransition[] {
  const transitions: AntigravityModelTransition[] = [];
  const settingsBlocks = [...text.matchAll(/<USER_SETTINGS_CHANGE>([\s\S]*?)<\/USER_SETTINGS_CHANGE>/gi)];
  for (const block of settingsBlocks) {
    const inner = block[1];
    const clean = (val: string | undefined): string | undefined => {
      if (!val) return undefined;
      const v = val.trim().replace(/\.\s*No need.*$/i, '').replace(/\.$/, '').trim();
      return v.toLowerCase() === 'none' || !v ? undefined : v;
    };

    const matchDetailed = inner.match(/`Model Selection`\s+from\s+(.*?)\s+to\s+(.*?)(?:\.\s+No need|\.\s*$|\.\s*\n|$)/i);
    if (matchDetailed) {
      const from = clean(matchDetailed[1]);
      const to = clean(matchDetailed[2]);
      if (to) {
        transitions.push({ from, to });
        continue;
      }
    }

    const matchTo = inner.match(/`Model Selection`\s+from\s+.*?\s+to\s+([^\n.]+)/i) || inner.match(/model:\s*([^\n<]+)/i);
    if (matchTo) {
      const to = clean(matchTo[1]);
      if (to) {
        transitions.push({ to });
      }
    }
  }
  return transitions;
}

function extractAntigravityModel(content: string): string {
  const changes = parseModelChanges(content);
  for (let i = changes.length - 1; i >= 0; i--) {
    if (changes[i].to) {
      return changes[i].to;
    }
  }
  return 'Gemini 3.8 Flash (High)';
}

function calculateAntigravityModelWeights(
  records: unknown[],
  content: string,
  fallbackModel: string,
): Map<string, number> {
  const modelWeights = new Map<string, number>();

  if (Array.isArray(records) && records.length > 0) {
    const transitionPoints: Array<{ index: number; from?: string; to: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const rec = asRecord(records[i]);
      if (!rec) continue;
      const text = typeof rec.content === 'string' ? rec.content : '';
      if (text.includes('<USER_SETTINGS_CHANGE>')) {
        const changes = parseModelChanges(text);
        for (const change of changes) {
          transitionPoints.push({ index: i, ...change });
        }
      }
    }

    let activeModel = fallbackModel;
    if (transitionPoints.length > 0) {
      if (transitionPoints[0].index === 0) {
        activeModel = transitionPoints[0].to;
      } else if (transitionPoints[0].from) {
        activeModel = transitionPoints[0].from;
      }
    }

    let nextTransitionIdx = 0;
    for (let i = 0; i < records.length; i++) {
      while (nextTransitionIdx < transitionPoints.length && transitionPoints[nextTransitionIdx].index <= i) {
        activeModel = transitionPoints[nextTransitionIdx].to;
        nextTransitionIdx++;
      }

      const rec = asRecord(records[i]);
      let weight = 1;
      if (rec) {
        const textLen = typeof rec.content === 'string' ? rec.content.length : 0;
        const thinkingLen = typeof rec.thinking === 'string' ? rec.thinking.length : 0;
        weight = Math.max(1, textLen + thinkingLen);
      }

      modelWeights.set(activeModel, (modelWeights.get(activeModel) || 0) + weight);
    }
  }

  if (modelWeights.size === 0) {
    const changes = parseModelChanges(content);
    if (changes.length > 0) {
      const models = new Set<string>();
      for (const c of changes) {
        if (c.from) models.add(c.from);
        models.add(c.to);
      }
      for (const m of models) {
        modelWeights.set(m, 1);
      }
    } else {
      modelWeights.set(fallbackModel, 1);
    }
  }

  return modelWeights;
}

function allocateTokensByWeight(
  modelWeights: Map<string, number>,
  totalInputTokens: number,
  totalOutputTokens: number,
  totalCachedTokens: number,
): Array<{
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}> {
  const totalWeight = Array.from(modelWeights.values()).reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) {
    const firstModel = modelWeights.keys().next().value || 'Gemini 3.8 Flash (High)';
    return [{
      model: firstModel,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      cachedTokens: totalCachedTokens > 0 ? totalCachedTokens : undefined,
    }];
  }

  const results: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedTokens?: number;
    weight: number;
  }> = [];

  let allocatedInput = 0;
  let allocatedOutput = 0;
  let allocatedCached = 0;

  const entries = Array.from(modelWeights.entries());
  for (let i = 0; i < entries.length; i++) {
    const [model, weight] = entries[i];
    const ratio = weight / totalWeight;

    const inputTokens = Math.round(totalInputTokens * ratio);
    const outputTokens = Math.round(totalOutputTokens * ratio);
    const cachedTokens = totalCachedTokens > 0 ? Math.round(totalCachedTokens * ratio) : 0;

    allocatedInput += inputTokens;
    allocatedOutput += outputTokens;
    allocatedCached += cachedTokens;

    results.push({
      model,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
      weight,
    });
  }

  results.sort((a, b) => b.weight - a.weight);
  const diffInput = totalInputTokens - allocatedInput;
  const diffOutput = totalOutputTokens - allocatedOutput;
  const diffCached = totalCachedTokens - allocatedCached;

  if (results.length > 0) {
    results[0].inputTokens += diffInput;
    results[0].outputTokens += diffOutput;
    results[0].totalTokens = results[0].inputTokens + results[0].outputTokens;
    if (totalCachedTokens > 0) {
      results[0].cachedTokens = Math.max(0, (results[0].cachedTokens || 0) + diffCached) || undefined;
    }
  }

  return results.map(({ model, inputTokens, outputTokens, totalTokens, cachedTokens }) => ({
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens,
  }));
}

function extractAntigravityTokenUsage(
  sessionDir: string,
  content: string,
  records: unknown[] = [],
): AiTokenUsage | undefined {
  let fallbackModel = extractAntigravityModel(content);
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
            fallbackModel = statusModel;
          }
          break;
        }
      }
    } catch {}
  }

  if (inputTokens === 0 && outputTokens === 0) return undefined;

  const totalTokens = inputTokens + outputTokens;
  const modelWeights = calculateAntigravityModelWeights(records, content, fallbackModel);
  const allocated = allocateTokensByWeight(modelWeights, inputTokens, outputTokens, cachedTokens);

  const byModel: ModelUsageDetail[] = [];
  let totalEstimatedCost = 0;

  for (const item of allocated) {
    const costResult = calculateTokenUsageCost({
      provider: 'gemini',
      model: item.model,
      usage: {
        inputTokens: item.inputTokens,
        outputTokens: item.outputTokens,
        cachedTokens: item.cachedTokens,
      },
    });

    totalEstimatedCost += costResult.cost;

    byModel.push({
      model: item.model,
      provider: AI_PROVIDER.ANTIGRAVITY,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      totalTokens: item.totalTokens,
      cachedTokens: item.cachedTokens,
      estimatedCostUsd: costResult.cost,
      rates: costResult.rates,
    });
  }

  byModel.sort((a, b) => b.totalTokens - a.totalTokens);
  const primary = byModel[0];

  return {
    provider: AI_PROVIDER.ANTIGRAVITY,
    model: primary?.model || fallbackModel,
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens: cachedTokens > 0 ? cachedTokens : undefined,
    estimatedCostUsd: Number(totalEstimatedCost.toFixed(6)),
    rates: primary?.rates,
    byModel: byModel.length > 0 ? byModel : undefined,
  };
}

function parseSession(sessionDir: string, sessionId: string): AiSession | null {
  const logFile = findLogFile(sessionDir);
  if (!logFile) return null;

  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const records = readJsonLines(content);
    const turns = parseTurns(records);
    if (turns.length === 0) return null;
    const internalTimestamp = latestRecordTimestamp(records, ['timestamp', 'created_at', 'updated_at']);

    const workspace = extractWorkspace(content);
    const tokenUsage = extractAntigravityTokenUsage(sessionDir, content, records);

    return {
      providerId: AI_PROVIDER.ANTIGRAVITY,
      sessionId,
      title: buildSessionTitle(AI_PROVIDER_NAME[AI_PROVIDER.ANTIGRAVITY], turns),
      turns,
      timestamp: internalTimestamp ?? safeMtime(logFile),
      timestampIsInternal: internalTimestamp !== null,
      projectSlug: workspace ? resolveProjectSlugFromDir(workspace) : undefined,
      attachments: loadAttachments(sessionDir),
      tokenUsage,
    };
  } catch {
    return null;
  }
}

function sessionIdFromLogPath(filePath: string): string {
  const parts = filePath.split(path.sep);
  const brainIndex = parts.lastIndexOf('brain');
  return parts[brainIndex + 1] || path.basename(path.dirname(path.dirname(path.dirname(filePath))));
}

export class AntigravityHistoryProvider implements AiHistoryProvider {
  readonly id = AI_PROVIDER.ANTIGRAVITY;
  readonly name = AI_PROVIDER_NAME[this.id];

  private getHistoryDirs(): string[] {
    const config = vscode.workspace.getConfiguration(AI_HISTORY_CONFIG.SECTION);
    const configured = config.get<string>(AI_HISTORY_CONFIG.ANTIGRAVITY_LOG_PATH);
    if (configured) return [configured];
    return [
      path.join(os.homedir(), ...AI_SESSION_PATH.ANTIGRAVITY_CLI),
      path.join(os.homedir(), ...AI_SESSION_PATH.ANTIGRAVITY_IDE),
    ];
  }

  async isEnabled(): Promise<boolean> {
    return this.getHistoryDirs().some((dir) => fs.existsSync(dir));
  }

  getSourceMtime(): number {
    return Math.max(0, ...this.getHistoryDirs().map(safeMtime));
  }

  async getRecentSessions(limit = DEFAULT_AI_SESSION_LIMIT): Promise<AiSession[]> {
    const candidateDirs: { sessionDir: string; sessionId: string; mtime: number }[] = [];

    for (const historyDir of this.getHistoryDirs()) {
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

    const targetLimit = Math.max(0, limit);
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

  watchSessions(callback: (session: AiSession) => void): vscode.Disposable {
    const timeouts = new Map<string, NodeJS.Timeout>();
    const watchers = this.getHistoryDirs()
      .filter((dir) => fs.existsSync(dir))
      .map((historyDir) => watchRecursive(
        historyDir,
        (fileName) => ANTIGRAVITY_LOG_FILES.includes(fileName as typeof ANTIGRAVITY_LOG_FILES[number]),
        (filePath) => {
          const sessionDir = path.dirname(path.dirname(path.dirname(filePath)));
          const pending = timeouts.get(sessionDir);
          if (pending) clearTimeout(pending);
          timeouts.set(sessionDir, setTimeout(() => {
            timeouts.delete(sessionDir);
            const session = parseSession(sessionDir, sessionIdFromLogPath(filePath));
            if (session) callback(session);
          }, AI_SESSION_FILE_DEBOUNCE_MS));
        },
      ));

    return new vscode.Disposable(() => {
      for (const timeout of timeouts.values()) clearTimeout(timeout);
      for (const watcher of watchers) watcher.dispose();
    });
  }
}

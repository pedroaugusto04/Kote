import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from '../../config.js';
import { AI_PROVIDER, AI_PROVIDER_NAME, AI_ROLE, AI_SESSION_PATH, AI_TEXT_CONTENT_TYPE, OPEN_CODE_FINAL_FINISH } from '../constants.js';
import type { AiHistoryProvider, AiSession, AiTurn, ModelUsageDetail } from '../types.js';
import { calculateTokenUsageCost } from '../token-accounting.js';
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

interface ModelTokenAccumulator {
  providerID?: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  nativeCost?: number;
}

interface SessionAccumulator {
  session: AiSession;
  messages: Map<string, { role: AiTurn['role']; textParts: string[] }>;
  usageMessageIds: Set<string>;
  models: Map<string, ModelTokenAccumulator>;
  lastModelID?: string;
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
      usageMessageIds: new Set(),
      models: new Map(),
    };
    sessions.set(row.sessionId, accumulator);
  }

  if (!row.messageId || !row.messageData) return;
  const message = asRecord(JSON.parse(row.messageData));
  const role = parseAiRole(message?.role);
  if (!role) return;

  // Track model and tokens from assistant messages
  if (role === AI_ROLE.ASSISTANT && !accumulator.usageMessageIds.has(row.messageId)) {
    accumulator.usageMessageIds.add(row.messageId);
    const rawModelID = typeof message?.modelID === 'string' ? message.modelID.trim() : '';
    const modelID = (rawModelID && !rawModelID.includes('<') && !rawModelID.includes('>')) ? rawModelID : (accumulator.lastModelID || 'unknown');
    accumulator.lastModelID = modelID;
    const providerID = typeof message?.providerID === 'string' ? message.providerID : undefined;

    let mAcc = accumulator.models.get(modelID);
    if (!mAcc) {
      mAcc = { providerID, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, cacheWriteTokens: 0 };
      accumulator.models.set(modelID, mAcc);
    }
    if (providerID && !mAcc.providerID) {
      mAcc.providerID = providerID;
    }

    if (typeof message?.cost === 'number' && Number.isFinite(message.cost)) {
      mAcc.nativeCost = (mAcc.nativeCost || 0) + message.cost;
    }
    const tokens = asRecord(message?.tokens);
    if (tokens) {
      if (typeof tokens.input === 'number') mAcc.inputTokens += tokens.input;
      if (typeof tokens.output === 'number') mAcc.outputTokens += tokens.output;
      if (typeof tokens.reasoning === 'number') mAcc.reasoningTokens += tokens.reasoning;
      const cache = asRecord(tokens.cache);
      if (typeof cache?.read === 'number') mAcc.cachedTokens += cache.read;
      if (typeof cache?.write === 'number') mAcc.cacheWriteTokens += cache.write;
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
    const { session, messages, models, lastModelID } = acc;
    const parsedTurns = [...messages.values()]
      .map(({ role, textParts }) => ({ role, content: textParts.join('\n\n').trim() }))
      .filter((turn) => turn.content);
    session.turns = keepFinalAssistantTurns(parsedTurns);

    if (models.size > 0) {
      const byModel: ModelUsageDetail[] = [];
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalReasoningTokens = 0;
      let totalCachedTokens = 0;
      let totalCacheWriteTokens = 0;
      let totalEstimatedCost = 0;

      for (const [mID, mData] of models.entries()) {
        const mTotal = mData.inputTokens + mData.outputTokens;
        const costResult = calculateTokenUsageCost({
          provider: mData.providerID || 'opencode',
          model: mID,
          usage: {
            inputTokens: mData.inputTokens,
            outputTokens: mData.outputTokens,
            cachedTokens: mData.cachedTokens,
            cacheWriteTokens: mData.cacheWriteTokens,
            reasoningTokens: mData.reasoningTokens,
            nativeCost: mData.nativeCost,
          },
        });

        totalInputTokens += mData.inputTokens;
        totalOutputTokens += mData.outputTokens;
        totalReasoningTokens += mData.reasoningTokens;
        totalCachedTokens += mData.cachedTokens;
        totalCacheWriteTokens += mData.cacheWriteTokens;
        totalEstimatedCost += costResult.cost;

        byModel.push({
          model: mID,
          provider: mData.providerID || AI_PROVIDER.OPEN_CODE,
          inputTokens: mData.inputTokens,
          outputTokens: mData.outputTokens,
          totalTokens: mTotal,
          reasoningTokens: mData.reasoningTokens > 0 ? mData.reasoningTokens : undefined,
          cachedTokens: mData.cachedTokens > 0 ? mData.cachedTokens : undefined,
          cacheWriteTokens: mData.cacheWriteTokens > 0 ? mData.cacheWriteTokens : undefined,
          estimatedCostUsd: costResult.cost,
          rates: costResult.rates,
        });
      }

      byModel.sort((a, b) => b.totalTokens - a.totalTokens);
      const primary = byModel[0];
      const primaryModel = primary?.model || lastModelID || 'unknown';

      session.tokenUsage = {
        provider: primary?.provider || AI_PROVIDER.OPEN_CODE,
        model: primaryModel,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        reasoningTokens: totalReasoningTokens > 0 ? totalReasoningTokens : undefined,
        cachedTokens: totalCachedTokens > 0 ? totalCachedTokens : undefined,
        cacheWriteTokens: totalCacheWriteTokens > 0 ? totalCacheWriteTokens : undefined,
        estimatedCostUsd: Number(totalEstimatedCost.toFixed(6)),
        rates: primary?.rates,
        byModel: byModel.length > 0 ? byModel : undefined,
      };
    }

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

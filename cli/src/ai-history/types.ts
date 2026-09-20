import type { AiProviderId, AiRole } from './constants.js';

export interface AiTurn {
  role: AiRole;
  content: string;
}

export interface AiSessionAttachment {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
}

export interface ModelUsageDetail {
  model: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  estimatedCostUsd: number;
  rates?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
}

export interface AiTokenUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  estimatedCostUsd: number;
  rates?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
  byModel?: ModelUsageDetail[];
}

export interface AiSession {
  providerId: AiProviderId;
  sessionId: string;
  title: string;
  turns: AiTurn[];
  timestamp: number;
  projectSlug?: string;
  attachments?: AiSessionAttachment[];
  tokenUsage?: AiTokenUsage;
}

export interface AiHistoryProvider {
  readonly id: AiProviderId;
  readonly name: string;
  getRecentSessions(limit?: number): Promise<AiSession[]>;
}

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

export interface NoteAiUsage {
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

export const AI_ANALYTICS_DEFAULTS = {
  UNKNOWN_MODEL: 'Unknown',
  NONE_MODEL: 'None',
  DEFAULT_PROVIDER: 'ai',
} as const;

export function isNoteAiUsage(value: unknown): value is NoteAiUsage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.totalTokens === 'number' &&
    candidate.totalTokens >= 0 &&
    typeof candidate.model === 'string'
  );
}

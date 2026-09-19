export interface NoteAiUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  estimatedCostUsd: number;
  rates?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
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

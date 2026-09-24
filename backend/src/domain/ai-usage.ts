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

export function getModelUsages(usage: NoteAiUsage, defaultSource?: string): ModelUsageDetail[] {
  if (Array.isArray(usage.byModel) && usage.byModel.length > 0) {
    return usage.byModel;
  }
  return [
    {
      model: (usage.model || AI_ANALYTICS_DEFAULTS.UNKNOWN_MODEL).trim(),
      provider: (usage.provider || defaultSource || AI_ANALYTICS_DEFAULTS.DEFAULT_PROVIDER).trim(),
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: typeof usage.estimatedCostUsd === 'number' ? usage.estimatedCostUsd : 0,
      rates: usage.rates,
    },
  ];
}

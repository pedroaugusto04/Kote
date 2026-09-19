export interface ModelUsageShare {
  model: string;
  totalTokens: number;
  estimatedCostUsd: number;
  sessionCount: number;
  percentage: number;
  rates?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
}

export interface ProviderUsageShare {
  provider: string;
  totalTokens: number;
  estimatedCostUsd: number;
  sessionCount: number;
  percentage: number;
}

export interface DailyTokenPoint {
  date: string;
  totalTokens: number;
  estimatedCostUsd: number;
  sessionCount: number;
}

export interface AiTokenAnalyticsFilters {
  workspaceSlug?: string;
  projectSlug?: string;
  startDate?: string;
  endDate?: string;
  model?: string;
  provider?: string;
}

export interface AiTokenAnalyticsResponse {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  totalAiSessions: number;
  topModel: string;
  byModel: ModelUsageShare[];
  byProvider: ProviderUsageShare[];
  dailyTrend: DailyTokenPoint[];
  availableModels: string[];
  availableProviders: string[];
}

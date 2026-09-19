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
  date: string; // YYYY-MM-DD
  totalTokens: number;
  estimatedCostUsd: number;
  sessionCount: number;
}

export interface AiTokenAnalyticsFilters {
  workspaceId?: string;
  projectId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
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

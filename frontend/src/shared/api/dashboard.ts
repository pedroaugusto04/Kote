import type { Dashboard, DashboardPayload } from './models/dashboard';
import type { ProductivityInsightsRaw } from './models/productivity';
import type { AiTokenAnalyticsFilters, AiTokenAnalyticsResponse } from './models/ai-token-analytics';
import { request } from './request';
import { API_PATHS, buildApiUrl } from './api-paths.constants';

export function fetchDashboard(): Promise<Dashboard> {
  return request<DashboardPayload>(API_PATHS.DASHBOARD);
}

export function fetchProductivityInsights(): Promise<ProductivityInsightsRaw> {
  return request<ProductivityInsightsRaw>(API_PATHS.PRODUCTIVITY_INSIGHTS);
}

export function fetchAiTokenAnalytics(params?: AiTokenAnalyticsFilters): Promise<AiTokenAnalyticsResponse> {
  return request<AiTokenAnalyticsResponse>(buildApiUrl(API_PATHS.AI_TOKEN_ANALYTICS, {
    workspaceSlug: params?.workspaceSlug || undefined,
    projectSlug: params?.projectSlug || undefined,
    startDate: params?.startDate || undefined,
    endDate: params?.endDate || undefined,
    model: params?.model || undefined,
    provider: params?.provider || undefined,
  }));
}

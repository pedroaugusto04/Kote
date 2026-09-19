import type { Dashboard, DashboardPayload } from './models/dashboard';
import type { ProductivityInsightsRaw } from './models/productivity';
import type { AiTokenAnalyticsFilters, AiTokenAnalyticsResponse } from './models/ai-token-analytics';
import { request } from './request';
import { API_PATHS } from './api-paths.constants';

export function fetchDashboard(): Promise<Dashboard> {
  return request<DashboardPayload>(API_PATHS.DASHBOARD);
}

export function fetchProductivityInsights(): Promise<ProductivityInsightsRaw> {
  return request<ProductivityInsightsRaw>(API_PATHS.PRODUCTIVITY_INSIGHTS);
}

export function fetchAiTokenAnalytics(params?: AiTokenAnalyticsFilters): Promise<AiTokenAnalyticsResponse> {
  const query = new URLSearchParams();
  if (params?.workspaceSlug) query.set('workspaceSlug', params.workspaceSlug);
  if (params?.projectSlug) query.set('projectSlug', params.projectSlug);
  if (params?.startDate) query.set('startDate', params.startDate);
  if (params?.endDate) query.set('endDate', params.endDate);
  if (params?.model) query.set('model', params.model);
  if (params?.provider) query.set('provider', params.provider);
  const qs = query.toString();
  const url = qs ? `${API_PATHS.AI_TOKEN_ANALYTICS}?${qs}` : API_PATHS.AI_TOKEN_ANALYTICS;
  return request<AiTokenAnalyticsResponse>(url);
}

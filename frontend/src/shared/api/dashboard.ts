import type { Dashboard, DashboardPayload } from './models/dashboard';
import type { ProductivityInsightsRaw } from './models/productivity';
import { request } from './request';
import { API_PATHS } from './api-paths.constants';

export function fetchDashboard(): Promise<Dashboard> {
  return request<DashboardPayload>(API_PATHS.DASHBOARD);
}

export function fetchProductivityInsights(): Promise<ProductivityInsightsRaw> {
  return request<ProductivityInsightsRaw>(API_PATHS.PRODUCTIVITY_INSIGHTS);
}

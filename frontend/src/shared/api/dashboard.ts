import type { Dashboard, DashboardPayload } from './models/dashboard';
import { request } from './request';
import { API_PATHS } from './api-paths.constants';

export function fetchDashboard(): Promise<Dashboard> {
  return request<DashboardPayload>(API_PATHS.DASHBOARD);
}

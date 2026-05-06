import type { PaginatedResponse } from './models/pagination';
import type { Reminder } from './models/reminder';
import { request } from './request';

export function fetchReminders(params: { page?: number; pageSize?: number; workspaceSlug?: string }) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || 10),
    workspaceSlug: params.workspaceSlug || '',
  });
  return request<PaginatedResponse<Reminder, 'reminders'>>(`/api/reminders?${search.toString()}`);
}

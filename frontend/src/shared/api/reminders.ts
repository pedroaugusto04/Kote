import { DEFAULT_PAGE_SIZE, type PaginatedResponse } from './models/pagination';
import type { Reminder } from './models/reminder';
import { request } from './request';

export function fetchReminders(params: { page?: number; pageSize?: number; workspaceSlug?: string; status?: string }) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
    workspaceSlug: params.workspaceSlug || '',
    status: params.status || '',
  });
  return request<PaginatedResponse<Reminder, 'reminders'>>(`/api/reminders?${search.toString()}`);
}

import { DEFAULT_PAGE_SIZE, type PaginatedResponse } from './models/pagination';
import type { Reminder, ReminderBoardResponse } from './models/reminder';
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

export function fetchReminderBoard(params: { workspaceSlug?: string; projectSlug?: string; limitPerColumn?: number }) {
  const search = new URLSearchParams({
    workspaceSlug: params.workspaceSlug || '',
    projectSlug: params.projectSlug || '',
    limitPerColumn: String(params.limitPerColumn || 50),
  });
  return request<ReminderBoardResponse>(`/api/reminders/board?${search.toString()}`);
}

export function updateReminderStatus(id: string, status: 'pending' | 'overdue' | 'resolved' | 'archived') {
  return request<{ ok: true; id: string; status: 'pending' | 'overdue' | 'resolved' | 'archived' }>(`/api/reminders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

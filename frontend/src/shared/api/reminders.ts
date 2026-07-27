import { DEFAULT_PAGE_SIZE, type PaginatedResponse } from './models/pagination';
import type { Reminder, ReminderBoardResponse } from './models/reminder';
import { request } from './request';
import { API_PATHS, buildApiPath } from './api-paths.constants';

export function fetchReminders(params: { page?: number; pageSize?: number; workspaceSlug?: string; status?: string }) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
    workspaceSlug: params.workspaceSlug || '',
    status: params.status || '',
  });
  return request<PaginatedResponse<Reminder, 'reminders'>>(`${API_PATHS.REMINDERS}?${search.toString()}`);
}

export function fetchReminderBoard(params: {
  workspaceSlug?: string;
  projectSlug?: string;
  limitPerColumn?: number;
  columnPage?: Record<string, number>;
}) {
  const search = new URLSearchParams({
    workspaceSlug: params.workspaceSlug || '',
    projectSlug: params.projectSlug || '',
    limitPerColumn: String(params.limitPerColumn || 50),
    overduePage: String(params.columnPage?.overdue || 1),
    upcomingPage: String(params.columnPage?.upcoming || 1),
    resolvedPage: String(params.columnPage?.resolved || 1),
    archivedPage: String(params.columnPage?.archived || 1),
  });

  return request<ReminderBoardResponse>(`${API_PATHS.REMINDERS_BOARD}?${search.toString()}`);
}

export function updateReminderStatus(id: string, status: 'pending' | 'overdue' | 'resolved' | 'archived') {
  return request<{ ok: true; id: string; status: 'pending' | 'overdue' | 'resolved' | 'archived' }>(buildApiPath(API_PATHS.REMINDER_STATUS, { id }), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function bulkUpdateReminderStatuses(ids: string[], status: 'pending' | 'overdue' | 'resolved' | 'archived') {
  return request<{ ok: true; updatedCount: number }>(API_PATHS.REMINDERS_BULK_STATUS, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, status }),
  });
}

import { DEFAULT_PAGE_SIZE, type PaginatedResponse } from './models/pagination';
import type { Reminder, ReminderBoardResponse } from './models/reminder';
import { request } from './request';
import { API_PATHS, buildApiPath, buildApiUrl } from './api-paths.constants';

export function fetchReminders(params: {
  page?: number;
  pageSize?: number;
  workspaceSlug?: string;
  projectSlug?: string;
  status?: string;
  query?: string;
  dueAfter?: string;
  dueBefore?: string;
}) {
  return request<PaginatedResponse<Reminder, 'reminders'>>(buildApiUrl(API_PATHS.REMINDERS, {
    page: params.page || 1,
    pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
    workspaceSlug: params.workspaceSlug || '',
    projectSlug: params.projectSlug || '',
    status: params.status || '',
    query: params.query?.trim() || undefined,
    dueAfter: params.dueAfter || undefined,
    dueBefore: params.dueBefore || undefined,
  }));
}

export function fetchReminderBoard(params: {
  workspaceSlug?: string;
  projectSlug?: string;
  limitPerColumn?: number;
  columnPage?: Record<string, number>;
}) {
  return request<ReminderBoardResponse>(buildApiUrl(API_PATHS.REMINDERS_BOARD, {
    workspaceSlug: params.workspaceSlug || '',
    projectSlug: params.projectSlug || '',
    limitPerColumn: params.limitPerColumn || 50,
    overduePage: params.columnPage?.overdue || 1,
    upcomingPage: params.columnPage?.upcoming || 1,
    resolvedPage: params.columnPage?.resolved || 1,
    archivedPage: params.columnPage?.archived || 1,
  }));
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

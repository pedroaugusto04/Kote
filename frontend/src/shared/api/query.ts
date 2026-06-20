import type { NoteStatusFilter } from './models/note-status';
import type { QueryResponse } from './models/query';
import { DEFAULT_PAGE_SIZE } from './models/pagination';
import { request } from './request';

function normalizeLimit(limit: number | undefined) {
  if (typeof limit !== 'number' || Number.isNaN(limit)) return 5;
  return Math.min(Math.max(Math.trunc(limit), 1), 10);
}

export function runQuery(params: { query: string; projectSlug?: string; workspaceSlug?: string; status?: NoteStatusFilter; limit?: number; page?: number; pageSize?: number }) {
  const search = new URLSearchParams({
    query: params.query,
    projectSlug: params.projectSlug || '',
    workspaceSlug: params.workspaceSlug || '',
    status: params.status || '',
    limit: String(normalizeLimit(params.limit)),
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
  });
  return request<QueryResponse>(`/api/query?${search.toString()}`);
}

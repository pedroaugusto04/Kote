import type { NoteStatusFilter } from './models/note-status';
import type { QueryResponse } from './models/query';
import { DEFAULT_PAGE_SIZE } from './models/pagination';
import { request } from './request';
import { buildApiUrl } from './api-paths.constants';

function normalizeLimit(limit: number | undefined) {
  if (typeof limit !== 'number' || Number.isNaN(limit)) return 5;
  return Math.min(Math.max(Math.trunc(limit), 1), 10);
}

export function runQuery(params: { query: string; projectSlug?: string; workspaceSlug?: string; status?: NoteStatusFilter; limit?: number; page?: number; pageSize?: number }) {
  return request<QueryResponse>(buildApiUrl('/api/query', {
    query: params.query,
    projectSlug: params.projectSlug || '',
    workspaceSlug: params.workspaceSlug || '',
    status: params.status || '',
    limit: normalizeLimit(params.limit),
    page: params.page || 1,
    pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
  }));
}

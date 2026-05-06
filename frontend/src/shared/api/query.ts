import type { QueryResponse } from './models/query';
import { request } from './request';

export function runQuery(params: { query: string; projectSlug?: string; workspaceSlug?: string; mode?: 'search' | 'answer'; limit?: number; page?: number; pageSize?: number }) {
  const search = new URLSearchParams({
    query: params.query,
    mode: params.mode || 'answer',
    projectSlug: params.projectSlug || '',
    workspaceSlug: params.workspaceSlug || '',
    limit: String(params.limit || 5),
    page: String(params.page || 1),
    pageSize: String(params.pageSize || 10),
  });
  return request<QueryResponse>(`/api/query?${search.toString()}`);
}

import type { Repository } from './models/project';
import type { CreateWorkspaceResponse } from './models/workspace';
import { request } from './request';

export function createWorkspace(params: { displayName: string; workspaceSlug?: string }) {
  return request<CreateWorkspaceResponse>('/api/workspaces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function fetchWorkspaceRepositories(workspaceSlug: string): Promise<{ ok: true; repositories: Repository[] }> {
  return request<{ ok: true; repositories: Repository[] }>(`/api/workspaces/${encodeURIComponent(workspaceSlug)}/repositories`);
}

import type { CreateWorkspaceResponse } from './models/workspace';
import { request } from './request';

export function createWorkspace(params: { displayName: string; workspaceSlug?: string }) {
  return request<CreateWorkspaceResponse>('/api/workspaces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

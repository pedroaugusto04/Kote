import type { CategoryRecord } from './models/category';
import type { CreateWorkspaceResponse } from './models/workspace';
import { request } from './request';
import { API_PATHS, buildApiPath } from './api-paths.constants';

export function createWorkspace(params: { displayName: string; workspaceSlug?: string }) {
  return request<CreateWorkspaceResponse>(API_PATHS.WORKSPACES, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function fetchWorkspaceCategories(workspaceSlug: string): Promise<CategoryRecord[]> {
  const result = await request<{ ok: true; categories: CategoryRecord[] }>(buildApiPath(API_PATHS.WORKSPACE_CATEGORIES, { workspaceSlug }));
  return result.categories;
}

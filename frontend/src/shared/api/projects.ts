import type { Project } from './models/project';
import type { Workspace } from './models/workspace';
import { request } from './request';

export type CreateProjectParams = {
  displayName: string;
  projectSlug?: string;
  repoFullName?: string;
  aliases?: string[];
  defaultTags?: string[];
};

export type CreateProjectResponse = {
  ok: true;
  project: Project;
  workspace: Workspace;
};

export function createProject(params: CreateProjectParams) {
  return request<CreateProjectResponse>('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export type UpdateProjectParams = {
  displayName: string;
  repoFullName?: string;
  aliases?: string[];
  defaultTags?: string[];
};

export function updateProject(projectSlug: string, params: UpdateProjectParams) {
  return request<{ ok: true; project: Project }>(`/api/projects/${encodeURIComponent(projectSlug)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function deleteProject(projectSlug: string) {
  return request<{ ok: true; projectSlug: string }>(`/api/projects/${encodeURIComponent(projectSlug)}`, {
    method: 'DELETE',
  });
}

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

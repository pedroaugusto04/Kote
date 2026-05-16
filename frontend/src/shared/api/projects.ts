import type { Project } from './models/project';
import type { ProjectFolder } from './models/project-folder';
import { DEFAULT_PAGE_SIZE, type PaginatedResponse } from './models/pagination';
import type { Workspace } from './models/workspace';
import { request } from './request';

export type CreateProjectParams = {
  displayName: string;
  projectSlug?: string;
  repositoryIds?: string[];
  defaultTags?: string[];
};

export type CreateProjectResponse = {
  ok: true;
  project: Project;
  workspace: Workspace;
};

export function fetchProjects(params: { page?: number; pageSize?: number; selectedSlug?: string }) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
    selectedSlug: params.selectedSlug || '',
  });
  return request<PaginatedResponse<Project, 'projects'>>(`/api/projects?${search.toString()}`);
}

export function createProject(params: CreateProjectParams) {
  return request<CreateProjectResponse>('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export type UpdateProjectParams = {
  displayName: string;
  repositoryIds?: string[];
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

export function fetchProjectFolders(projectSlug: string) {
  return request<{ ok: true; projectSlug: string; folders: ProjectFolder[] }>(`/api/projects/${encodeURIComponent(projectSlug)}/folders`);
}

export function createProjectFolder(projectSlug: string, params: { displayName: string; parentFolderId?: string }) {
  return request<{ ok: true; folder: ProjectFolder }>(`/api/projects/${encodeURIComponent(projectSlug)}/folders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function updateProjectFolder(projectSlug: string, folderId: string, params: { displayName: string; parentFolderId?: string }) {
  return request<{ ok: true; folder: ProjectFolder }>(`/api/projects/${encodeURIComponent(projectSlug)}/folders/${encodeURIComponent(folderId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function deleteProjectFolder(projectSlug: string, folderId: string) {
  return request<{ ok: true; folderId: string; projectSlug: string }>(`/api/projects/${encodeURIComponent(projectSlug)}/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
  });
}

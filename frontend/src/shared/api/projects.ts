import type { Project } from './models/project';
import type { ProjectBriefResponse, SavedProjectBriefResponse, ProjectBriefHistoryResponse } from './models/project-brief';
import type { ProjectFolder } from './models/project-folder';
import type { ProjectKnowledgeMapQuery, ProjectKnowledgeMapResponse } from './models/project-knowledge-map';
import type { ProjectTimelineCategory, ProjectTimelineItem } from './models/project-timeline';
import { DEFAULT_PAGE_SIZE, type PaginatedResponse } from './models/pagination';
import type { Workspace } from './models/workspace';
import { request } from './request';
import { API_PATHS } from './api-paths.constants';

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
  return request<PaginatedResponse<Project, 'projects'>>(`${API_PATHS.PROJECTS}?${search.toString()}`);
}

export function createProject(params: CreateProjectParams) {
  return request<CreateProjectResponse>(API_PATHS.PROJECTS, {
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
  return request<{ ok: true; project: Project }>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function deleteProject(projectSlug: string) {
  return request<{ ok: true; projectSlug: string }>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}`, {
    method: 'DELETE',
  });
}

export function setProjectFavorite(projectSlug: string, favorite: boolean) {
  return request<{ ok: true; project: Project }>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}/favorite`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ favorite }),
  });
}

export function fetchProjectFolders(projectSlug: string) {
  return request<{ ok: true; projectSlug: string; folders: ProjectFolder[] }>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}/folders`);
}

export function fetchProjectTimeline(projectSlug: string, params: { page?: number; pageSize?: number; category?: ProjectTimelineCategory; folderId?: string; status?: string; orderByPin?: boolean }) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
    category: params.category || 'all',
  });
  if (params.folderId) search.set('folderId', params.folderId);
  if (params.status !== undefined) search.set('status', params.status);
  if (params.orderByPin !== undefined) search.set('orderByPin', String(params.orderByPin));
  return request<PaginatedResponse<ProjectTimelineItem, 'timeline'>>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}/timeline?${search.toString()}`);
}

export function fetchProjectKnowledgeMap(projectSlug: string, params: ProjectKnowledgeMapQuery = {}) {
  const search = new URLSearchParams({
    limit: String(params.limit || 80),
    category: params.category || 'all',
  });
  if (params.folderId) search.set('folderId', params.folderId);
  return request<ProjectKnowledgeMapResponse>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}/knowledge-map?${search.toString()}`);
}

export function generateProjectBrief(projectSlug: string) {
  return request<ProjectBriefResponse>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}/brief`, {
    method: 'POST',
  });
}

export function fetchLatestProjectBrief(projectSlug: string) {
  return request<SavedProjectBriefResponse>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}/brief`);
}

export function fetchProjectBriefHistory(projectSlug: string, params: { page?: number; pageSize?: number } = {}) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
  });
  return request<ProjectBriefHistoryResponse>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}/brief/history?${search.toString()}`);
}

export function fetchAllProjectsTimeline(params: { page?: number; pageSize?: number; category?: ProjectTimelineCategory; status?: string; orderByPin?: boolean }) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || DEFAULT_PAGE_SIZE),
    category: params.category || 'all',
  });
  if (params.status !== undefined) search.set('status', params.status);
  if (params.orderByPin !== undefined) search.set('orderByPin', String(params.orderByPin));
  return request<PaginatedResponse<ProjectTimelineItem, 'timeline'>>(`${API_PATHS.PROJECTS_TIMELINE}?${search.toString()}`);
}

export function createProjectFolder(projectSlug: string, params: { displayName: string; parentFolderId?: string }) {
  return request<{ ok: true; folder: ProjectFolder }>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}/folders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function updateProjectFolder(projectSlug: string, folderId: string, params: { displayName: string; parentFolderId?: string }) {
  return request<{ ok: true; folder: ProjectFolder }>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}/folders/${encodeURIComponent(folderId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function deleteProjectFolder(projectSlug: string, folderId: string) {
  return request<{ ok: true; folderId: string; projectSlug: string }>(`${API_PATHS.PROJECTS}/${encodeURIComponent(projectSlug)}/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
  });
}

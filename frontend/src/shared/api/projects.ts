import type { Project } from './models/project';
import type { ProjectBriefResponse, SavedProjectBriefResponse, ProjectBriefHistoryResponse } from './models/project-brief';
import type { ProjectFolder } from './models/project-folder';
import type { ProjectKnowledgeMapQuery, ProjectKnowledgeMapResponse } from './models/project-knowledge-map';
import type { ProjectTimelineCategory, ProjectTimelineItem } from './models/project-timeline';
import type { ProjectDecisionsResponse, FetchProjectDecisionsParams, ExportProjectAdrsParams } from './models/project-decisions';
import type { ProjectCommitsResponse, FetchProjectCommitsParams } from './models/project-commits';
import { DEFAULT_PAGE_SIZE, type PaginatedResponse } from './models/pagination';
import type { Workspace } from './models/workspace';
import { request, requestBlob } from './request';
import { API_PATHS, buildApiPath, buildApiUrl } from './api-paths.constants';

function triggerBlobDownload(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return;
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(objectUrl);
  document.body.removeChild(a);
}

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
  return request<PaginatedResponse<Project, 'projects'>>(buildApiUrl(API_PATHS.PROJECTS, {
    page: params.page || 1,
    pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
    selectedSlug: params.selectedSlug || '',
  }));
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
  return request<{ ok: true; project: Project }>(buildApiPath(API_PATHS.PROJECT_DETAIL, { projectSlug }), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function deleteProject(projectSlug: string) {
  return request<{ ok: true; projectSlug: string }>(buildApiPath(API_PATHS.PROJECT_DETAIL, { projectSlug }), {
    method: 'DELETE',
  });
}

export function setProjectFavorite(projectSlug: string, favorite: boolean) {
  return request<{ ok: true; project: Project }>(buildApiPath(API_PATHS.PROJECT_FAVORITE, { projectSlug }), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ favorite }),
  });
}

export function fetchProjectFolders(projectSlug: string) {
  return request<{ ok: true; projectSlug: string; folders: ProjectFolder[] }>(buildApiPath(API_PATHS.PROJECT_FOLDERS, { projectSlug }));
}

export function fetchProjectTimeline(projectSlug: string, params: { page?: number; pageSize?: number; category?: ProjectTimelineCategory; folderId?: string; status?: string; orderByPin?: boolean }) {
  return request<PaginatedResponse<ProjectTimelineItem, 'timeline'>>(
    buildApiUrl(buildApiPath(API_PATHS.PROJECT_TIMELINE, { projectSlug }), {
      page: params.page || 1,
      pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
      category: params.category || 'all',
      folderId: params.folderId || undefined,
      status: params.status,
      orderByPin: params.orderByPin,
    }),
  );
}

export function fetchProjectKnowledgeMap(projectSlug: string, params: ProjectKnowledgeMapQuery = {}) {
  return request<ProjectKnowledgeMapResponse>(
    buildApiUrl(buildApiPath(API_PATHS.PROJECT_KNOWLEDGE_MAP, { projectSlug }), {
      limit: params.limit || 80,
      category: params.category || 'all',
      folderId: params.folderId || undefined,
      excludeReviewNotes: params.excludeReviewNotes ? true : undefined,
    }),
  );
}

export function generateProjectBrief(projectSlug: string, workspaceSlug?: string) {
  return request<ProjectBriefResponse>(
    buildApiUrl(buildApiPath(API_PATHS.PROJECT_BRIEF, { projectSlug }), {
      workspaceSlug: workspaceSlug || undefined,
    }),
    { method: 'POST' },
  );
}

export function fetchLatestProjectBrief(projectSlug: string, workspaceSlug?: string) {
  return request<SavedProjectBriefResponse>(
    buildApiUrl(buildApiPath(API_PATHS.PROJECT_BRIEF, { projectSlug }), {
      workspaceSlug: workspaceSlug || undefined,
    }),
  );
}

export function fetchProjectBriefHistory(projectSlug: string, params: { page?: number; pageSize?: number; workspaceSlug?: string } = {}) {
  return request<ProjectBriefHistoryResponse>(
    buildApiUrl(buildApiPath(API_PATHS.PROJECT_BRIEF_HISTORY, { projectSlug }), {
      page: params.page || 1,
      pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
      workspaceSlug: params.workspaceSlug || undefined,
    }),
  );
}

export function fetchAllProjectsTimeline(params: { page?: number; pageSize?: number; category?: ProjectTimelineCategory; status?: string; orderByPin?: boolean }) {
  return request<PaginatedResponse<ProjectTimelineItem, 'timeline'>>(
    buildApiUrl(API_PATHS.PROJECTS_TIMELINE, {
      page: params.page || 1,
      pageSize: params.pageSize || DEFAULT_PAGE_SIZE,
      category: params.category || 'all',
      status: params.status,
      orderByPin: params.orderByPin,
    }),
  );
}

export function createProjectFolder(projectSlug: string, params: { displayName: string; parentFolderId?: string }) {
  return request<{ ok: true; folder: ProjectFolder }>(buildApiPath(API_PATHS.PROJECT_FOLDERS, { projectSlug }), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function updateProjectFolder(projectSlug: string, folderId: string, params: { displayName: string; parentFolderId?: string }) {
  return request<{ ok: true; folder: ProjectFolder }>(buildApiPath(API_PATHS.PROJECT_FOLDER_DETAIL, { projectSlug, folderId }), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function deleteProjectFolder(projectSlug: string, folderId: string) {
  return request<{ ok: true; folderId: string; projectSlug: string }>(buildApiPath(API_PATHS.PROJECT_FOLDER_DETAIL, { projectSlug, folderId }), {
    method: 'DELETE',
  });
}

export async function fetchProjectCoverage<T = any>(projectSlug: string, forceSync = false): Promise<T> {
  const basePath = buildApiPath(API_PATHS.PROJECT_COVERAGE, { projectSlug });
  const url = forceSync ? `${basePath}?forceSync=true` : basePath;
  const res = await request<any>(url);
  return (res?.coverage || res) as T;
}

export function fetchProjectDependencies(projectSlug: string) {
  return request<import('./models/dependency-watcher').ProjectDependenciesResponse>(buildApiPath(API_PATHS.PROJECT_DEPENDENCIES, { projectSlug }));
}

export type ExportProjectNotesZipParams = {
  projectSlug?: string;
  folderId?: string;
  category?: ProjectTimelineCategory;
  status?: string;
  query?: string;
};

export async function exportProjectNotesZip(params: ExportProjectNotesZipParams = {}) {
  const url = buildApiUrl(API_PATHS.PROJECTS_EXPORT_ZIP, {
    projectSlug: params.projectSlug || undefined,
    folderId: params.folderId || undefined,
    category: params.category && params.category !== 'all' ? params.category : undefined,
    status: params.status,
    query: params.query?.trim() || undefined,
  });
  const result = await requestBlob(url);
  const fallbackFilename = `kote-${params.projectSlug || 'all-projects'}-${new Date().toISOString().split('T')[0]}.zip`;
  const filename = result.filename || fallbackFilename;
  triggerBlobDownload(result.blob, filename);
  return { ok: true, filename };
}

export function fetchProjectDecisions(projectSlug: string, params: FetchProjectDecisionsParams = {}) {
  return request<ProjectDecisionsResponse>(
    buildApiUrl(buildApiPath(API_PATHS.PROJECT_DECISIONS, { projectSlug }), {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
      status: params.status || undefined,
      file: params.file || undefined,
      search: params.search?.trim() || undefined,
      kind: params.kind && params.kind !== 'all' ? params.kind : undefined,
    }),
  );
}

export async function exportProjectAdrsZip(projectSlug: string, params: ExportProjectAdrsParams = {}) {
  const url = buildApiUrl(buildApiPath(API_PATHS.PROJECT_DECISIONS_EXPORT_ADR, { projectSlug }), {
    status: params.status || undefined,
    file: params.file || undefined,
    search: params.search?.trim() || undefined,
    kind: params.kind && params.kind !== 'all' ? params.kind : undefined,
  });
  const result = await requestBlob(url);
  const fallbackFilename = `kote-${projectSlug}-adrs-${new Date().toISOString().split('T')[0]}.zip`;
  const filename = result.filename || fallbackFilename;
  triggerBlobDownload(result.blob, filename);
  return { ok: true, filename };
}

export function fetchProjectCommits(projectSlug: string, params: FetchProjectCommitsParams = {}) {
  const hasLinkFilter = params.linkFilter && params.linkFilter !== 'all';
  return request<ProjectCommitsResponse>(
    buildApiUrl(buildApiPath(API_PATHS.PROJECT_COMMITS, { projectSlug }), {
      page: params.page || 1,
      pageSize: params.pageSize || 20,
      linkFilter: hasLinkFilter ? params.linkFilter : undefined,
      onlyLinked: !hasLinkFilter && params.onlyLinked ? true : undefined,
      query: params.query?.trim() || undefined,
    }),
  );
}



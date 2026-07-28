import type {
  GithubIntegrationRepository,
  GithubRepositoriesResponse,
  GithubBackfillStartResponse,
  GithubBackfillStatusResponse,
  IntegrationConnectionResponse,
  IntegrationConnectionSession,
  IntegrationsResponse,
  IntegrationTestResponse,
} from './models/integration';
import { request } from './request';
import { API_PATHS, buildApiPath } from './api-paths.constants';

export function fetchIntegrations(workspaceSlug: string): Promise<IntegrationsResponse> {
  const search = new URLSearchParams({ workspaceSlug });
  return request<IntegrationsResponse>(`${API_PATHS.INTEGRATIONS}?${search.toString()}`);
}

export function connectIntegration(params: { provider: string; workspaceSlug: string; returnToPath?: string }): Promise<IntegrationConnectionResponse> {
  return request<IntegrationConnectionResponse>(buildApiPath(API_PATHS.INTEGRATIONS_CONNECT, { provider: params.provider }), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceSlug: params.workspaceSlug, returnToPath: params.returnToPath }),
  });
}

export function fetchIntegrationSession(params: { provider: string; sessionId: string }): Promise<{ ok: true; session: IntegrationConnectionSession }> {
  return request<{ ok: true; session: IntegrationConnectionSession }>(
    buildApiPath(API_PATHS.INTEGRATIONS_SESSIONS, { provider: params.provider, sessionId: params.sessionId }),
  );
}

export function revokeIntegration(provider: string, workspaceSlug: string) {
  const search = new URLSearchParams({ workspaceSlug });
  return request(`${buildApiPath(API_PATHS.INTEGRATIONS_DETAIL, { provider })}?${search.toString()}`, { method: 'DELETE' });
}

export function testIntegration(provider: string, workspaceSlug: string): Promise<IntegrationTestResponse> {
  const search = new URLSearchParams({ workspaceSlug });
  return request<IntegrationTestResponse>(`${buildApiPath(API_PATHS.INTEGRATIONS_TEST, { provider })}?${search.toString()}`, { method: 'POST' });
}

export function fetchGithubRepositories(workspaceSlug: string): Promise<GithubRepositoriesResponse> {
  const search = new URLSearchParams({ workspaceSlug });
  return request<GithubRepositoriesResponse>(`${API_PATHS.INTEGRATIONS_GITHUB_REPOSITORIES}?${search.toString()}`);
}

export function saveGithubRepositories(workspaceSlug: string, repositories: Array<Pick<GithubIntegrationRepository, 'id' | 'fullName'>>) {
  return request(API_PATHS.INTEGRATIONS_GITHUB_REPOSITORIES, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceSlug, repositories }),
  });
}

export function startGithubBackfill(workspaceSlug: string, repositories: string[]): Promise<GithubBackfillStartResponse> {
  return request<GithubBackfillStartResponse>(API_PATHS.INTEGRATIONS_GITHUB_BACKFILL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceSlug, repositories }),
  });
}

export function fetchGithubBackfillStatus(workspaceSlug: string, jobId: string): Promise<GithubBackfillStatusResponse> {
  const search = new URLSearchParams({ workspaceSlug, jobId });
  return request<GithubBackfillStatusResponse>(`${API_PATHS.INTEGRATIONS_GITHUB_BACKFILL_STATUS}?${search.toString()}`);
}

export function cancelGithubBackfill(workspaceSlug: string, jobId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(API_PATHS.INTEGRATIONS_GITHUB_BACKFILL_CANCEL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceSlug, jobId }),
  });
}

export function importDependenciesFromGithub(
  workspaceSlug: string,
  options?: { projectIds?: string[]; repositoryIds?: string[] },
): Promise<{ ok: true; data: { total: number; imported: number; skipped: number; repositories: number } }> {
  return request<{ ok: true; data: { total: number; imported: number; skipped: number; repositories: number } }>(API_PATHS.INTEGRATIONS_DEPENDENCY_WATCH_IMPORT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceSlug, ...options }),
  });
}

export function fetchDependencyMonitoredRepositories(workspaceSlug: string) {
  const search = new URLSearchParams({ workspaceSlug });
  return request<import('./models/dependency-watcher').DependencyMonitoredRepositoriesResponse>(`${API_PATHS.INTEGRATIONS_DEPENDENCY_WATCH_REPOSITORIES}?${search.toString()}`);
}

export function saveDependencyMonitoredRepositories(workspaceSlug: string, repositoryIds: string[]) {
  return request<{ ok: true; data: { monitored: number; import: { jobId: string; queued: number; repositories: number } } }>(API_PATHS.INTEGRATIONS_DEPENDENCY_WATCH_REPOSITORIES, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceSlug, repositoryIds }),
  });
}

export function enableDependencyWatcher(workspaceSlug: string): Promise<{ ok: true; data: { enabled: boolean } }> {
  return request<{ ok: true; data: { enabled: boolean } }>(buildApiPath(API_PATHS.INTEGRATIONS_DEPENDENCY_WATCH_ENABLE, { workspaceSlug }), {
    method: 'PATCH',
  });
}

export function disableDependencyWatcher(workspaceSlug: string): Promise<{ ok: true; data: { enabled: boolean } }> {
  return request<{ ok: true; data: { enabled: boolean } }>(buildApiPath(API_PATHS.INTEGRATIONS_DEPENDENCY_WATCH_DISABLE, { workspaceSlug }), {
    method: 'PATCH',
  });
}

export function checkProjectDependencies(projectId: string, projectSlug: string): Promise<{ ok: true; data: { jobId: string; queued: number } }> {
  return request<{ ok: true; data: { jobId: string; queued: number } }>(API_PATHS.INTEGRATIONS_DEPENDENCY_WATCH_CHECK_PROJECT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, projectSlug }),
  });
}

import type { Dashboard, DashboardPayload } from './models/dashboard';
import { ApiClientError, isApiErrorEnvelope } from './models/error';
import type { GithubRepositoriesResponse, IntegrationConnectionResponse, IntegrationConnectionSession, IntegrationsResponse, IntegrationTestResponse } from './models/integration';
import type { NoteDetail } from './models/note';
import type { QueryResponse } from './models/query';
import type { CreateWorkspaceResponse } from './models/workspace';
import { normalizeDashboard } from './normalizers/dashboard';

const apiBasePath = (import.meta.env.VITE_KB_API_BASE_PATH || '').replace(/\/$/, '');

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function resolveApiPath(path: string) {
  if (!apiBasePath || !path.startsWith('/api')) return path;
  return `${apiBasePath}${path.slice('/api'.length) || '/'}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(resolveApiPath(path), {
    ...init,
    credentials: 'include',
    headers: { accept: 'application/json', ...(init.headers || {}) },
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const requestId = response.headers.get('x-request-id') || (isApiErrorEnvelope(payload) ? payload.requestId : '');
    const code = isApiErrorEnvelope(payload) ? payload.error.code : 'request_failed';
    const message = isApiErrorEnvelope(payload) ? payload.error.message : 'Request failed.';
    const details = isApiErrorEnvelope(payload) ? payload.error.details : {};
    throw new ApiClientError({ status: response.status, code, message, requestId, details });
  }
  return payload as T;
}

export { ApiClientError };

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

export function login(params: { email: string; password: string }) {
  return request<{ ok: true; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function signup(params: { name: string; email: string; password: string }) {
  return request<{ ok: true; user: AuthUser }>('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function logout() {
  return request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
}

export function fetchDashboard(): Promise<Dashboard> {
  return request<DashboardPayload>('/api/dashboard').then(normalizeDashboard);
}

export function createWorkspace(params: { displayName: string; workspaceSlug?: string }) {
  return request<CreateWorkspaceResponse>('/api/workspaces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function fetchIntegrations(workspaceSlug: string): Promise<IntegrationsResponse> {
  const search = new URLSearchParams({ workspaceSlug });
  return request<IntegrationsResponse>(`/api/integrations?${search.toString()}`);
}

export function connectIntegration(params: { provider: string; workspaceSlug: string; returnToPath?: string }): Promise<IntegrationConnectionResponse> {
  return request<IntegrationConnectionResponse>(`/api/integrations/${encodeURIComponent(params.provider)}/connect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceSlug: params.workspaceSlug, returnToPath: params.returnToPath }),
  });
}

export function fetchIntegrationSession(params: { provider: string; sessionId: string }): Promise<{ ok: true; session: IntegrationConnectionSession }> {
  return request<{ ok: true; session: IntegrationConnectionSession }>(
    `/api/integrations/${encodeURIComponent(params.provider)}/sessions/${encodeURIComponent(params.sessionId)}`,
  );
}

export function revokeIntegration(provider: string, workspaceSlug: string) {
  const search = new URLSearchParams({ workspaceSlug });
  return request(`/api/integrations/${encodeURIComponent(provider)}?${search.toString()}`, { method: 'DELETE' });
}

export function testIntegration(provider: string, workspaceSlug: string): Promise<IntegrationTestResponse> {
  const search = new URLSearchParams({ workspaceSlug });
  return request<IntegrationTestResponse>(`/api/integrations/${encodeURIComponent(provider)}/test?${search.toString()}`, { method: 'POST' });
}

export function fetchGithubRepositories(workspaceSlug: string): Promise<GithubRepositoriesResponse> {
  const search = new URLSearchParams({ workspaceSlug });
  return request<GithubRepositoriesResponse>(`/api/integrations/github-app/repositories?${search.toString()}`);
}

export function saveGithubRepositories(workspaceSlug: string, repositories: string[]) {
  return request('/api/integrations/github-app/repositories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceSlug, repositories }),
  });
}

export async function fetchNote(id: string): Promise<NoteDetail> {
  const result = await request<{ ok: true; note: NoteDetail }>(`/api/notes/${encodeURIComponent(id)}`);
  return result.note;
}

export function runQuery(params: { query: string; projectSlug?: string; workspaceSlug?: string; mode?: 'search' | 'answer'; limit?: number }) {
  const search = new URLSearchParams({
    query: params.query,
    mode: params.mode || 'answer',
    projectSlug: params.projectSlug || '',
    workspaceSlug: params.workspaceSlug || '',
    limit: String(params.limit || 5),
  });
  return request<QueryResponse>(`/api/query?${search.toString()}`);
}

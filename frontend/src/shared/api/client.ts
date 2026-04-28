import type { Dashboard, DashboardPayload } from './models/dashboard';
import type { IntegrationsResponse } from './models/integration';
import type { NoteDetail } from './models/note';
import type { QueryResponse } from './models/query';
import { normalizeDashboard } from './normalizers/dashboard';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { accept: 'application/json', ...(init.headers || {}) },
  });
  if (!response.ok) {
    throw new Error(`request_failed:${response.status}`);
  }
  return (await response.json()) as T;
}

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

export function fetchIntegrations(): Promise<IntegrationsResponse> {
  return request<IntegrationsResponse>('/api/integrations');
}

export function saveIntegration(params: {
  provider: string;
  workspaceSlug: string;
  config: Record<string, string>;
  publicMetadata?: Record<string, unknown>;
  externalIdentities?: Array<{ provider: string; externalId: string }>;
}) {
  return request(`/api/integrations/${encodeURIComponent(params.provider)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workspaceSlug: params.workspaceSlug,
      config: params.config,
      publicMetadata: params.publicMetadata || {},
      externalIdentities: params.externalIdentities || [],
    }),
  });
}

export function revokeIntegration(provider: string, workspaceSlug: string) {
  const search = new URLSearchParams({ workspaceSlug });
  return request(`/api/integrations/${encodeURIComponent(provider)}?${search.toString()}`, { method: 'DELETE' });
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

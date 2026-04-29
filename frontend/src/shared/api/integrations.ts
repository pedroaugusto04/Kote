import type {
  GithubRepositoriesResponse,
  IntegrationConnectionResponse,
  IntegrationConnectionSession,
  IntegrationsResponse,
  IntegrationTestResponse,
} from './models/integration';
import { request } from './request';

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

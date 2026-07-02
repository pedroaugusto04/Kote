import type { StoredIntegrationStatus } from '../enums';

export type IntegrationsResponse = {
  ok: true;
  workspaceSlug: string;
  integrations: UserIntegration[];
  githubBackfillLimit: number;
};

export type UserIntegration = {
  provider: string;
  name: string;
  description: string;
  status: StoredIntegrationStatus;
  workspaceSlug: string;
  publicMetadata: Record<string, unknown>;
  primaryAction: { type: 'connect' | 'revoke' | 'none'; label: string } | null;
  steps: string[];
  lastError: string | null;
  connectedAccount: string | null;
  updatedAt: string | null;
  revokedAt: string | null;
};

export type IntegrationConnectionSession = {
  id: string;
  provider: string;
  status: string;
  workspaceSlug: string;
  expiresAt: string;
  consumedAt: string | null;
  connectedAccount?: string;
  lastError?: string;
};

export type IntegrationConnectionResponse = {
  ok: true;
  provider: string;
  session?: IntegrationConnectionSession;
  primaryAction?: { type: string; label: string; url?: string };
  verificationCode?: string;
  instruction?: string;
  steps?: string[];
};

export type GithubIntegrationRepository = {
  id: string;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  htmlUrl: string;
  description?: string | null;
  defaultBranch?: string | null;
  selected: boolean;
};

export type GithubRepositoriesResponse = {
  ok: true;
  workspaceSlug: string;
  repositories: GithubIntegrationRepository[];
};

export type GithubBackfillJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'quota_exceeded' | 'not_found';

export type GithubBackfillStatusResponse = {
  ok: boolean;
  status?: 'not_found';
  job?: {
    id: string;
    status: GithubBackfillJobStatus;
    total: number;
    processed: number;
    imported: number;
    skipped: number;
    limit: number;
    repositories: string[];
    error: string | null;
    startedAt: string;
    updatedAt: string;
    completedAt: string | null;
  };
};

export type GithubBackfillStartResponse = {
  ok: true;
  jobId: string;
  limit: number;
};

export type IntegrationTestResponse = {
  ok: true;
  provider: string;
  active: boolean;
  configured: boolean;
  missing: string[];
  message: string;
};

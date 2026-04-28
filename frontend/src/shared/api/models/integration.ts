import type { StoredIntegrationStatus } from '../enums';

export type IntegrationsResponse = {
  ok: true;
  workspaceSlug: string;
  integrations: UserIntegration[];
};

export type UserIntegration = {
  provider: string;
  name: string;
  description: string;
  status: StoredIntegrationStatus;
  workspaceSlug: string;
  publicMetadata: Record<string, unknown>;
  maskedConfig: Record<string, string>;
  updatedAt: string | null;
  revokedAt: string | null;
};

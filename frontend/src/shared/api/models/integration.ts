import type { IntegrationSetupStatus, StoredIntegrationStatus } from '../enums';

export type IntegrationStatusValue = IntegrationSetupStatus;

export type IntegrationStatus = {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatusValue;
  requiredEnv: string[];
  configuredEnv: string[];
  missingEnv: string[];
  links: Array<{
    label: string;
    url: string;
    external: boolean;
  }>;
  checklist: string[];
  warnings: string[];
};

export type IntegrationsResponse = {
  ok: true;
  workspaceSlug: string;
  integrations: IntegrationStatus[] | UserIntegration[];
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

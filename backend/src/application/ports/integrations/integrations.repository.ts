import type { ExternalIdentityRecord, IntegrationConnectionSessionRecord, IntegrationCredentialRecord } from '../../models/repository-records.models.js';

export abstract class CredentialRepository {
  abstract listCredentials(userId: string, workspaceSlug: string): Promise<IntegrationCredentialRecord[]>;
  abstract upsertCredential(
    input: Pick<IntegrationCredentialRecord, 'userId' | 'workspaceSlug' | 'provider' | 'status' | 'encryptedConfig' | 'publicMetadata'>,
  ): Promise<IntegrationCredentialRecord>;
  abstract revokeCredential(userId: string, workspaceSlug: string, provider: string, encryptedConfig: unknown): Promise<IntegrationCredentialRecord | null>;
  abstract findCredential(userId: string, workspaceSlug: string, provider: string): Promise<IntegrationCredentialRecord | null>;
}

export abstract class ExternalIdentityRepository {
  abstract findExternalIdentity(provider: string, identityType: string, externalId: string): Promise<ExternalIdentityRecord | null>;
  abstract deleteExternalIdentities(input: {
    userId: string;
    workspaceSlug: string;
    provider: string;
  }): Promise<number>;
  abstract upsertExternalIdentity(input: {
    userId: string;
    workspaceSlug: string;
    provider: string;
    identityType: string;
    externalId: string;
    credentialId?: string | null;
    verifiedAt?: string | null;
    metadata?: Record<string, unknown>;
    publicMetadata: Record<string, unknown>;
  }): Promise<ExternalIdentityRecord>;
}

export abstract class IntegrationConnectionSessionRepository {
  abstract createConnectionSession(
    input: Pick<
      IntegrationConnectionSessionRecord,
      'userId' | 'workspaceSlug' | 'provider' | 'stateHash' | 'verificationCodeHash' | 'status' | 'metadata' | 'expiresAt'
    >,
  ): Promise<IntegrationConnectionSessionRecord>;
  abstract findConnectionSession(id: string): Promise<IntegrationConnectionSessionRecord | null>;
  abstract findActiveConnectionSessionByState(provider: string, stateHash: string, nowIso: string): Promise<IntegrationConnectionSessionRecord | null>;
  abstract findActiveConnectionSessionByCode(provider: string, verificationCodeHash: string, nowIso: string): Promise<IntegrationConnectionSessionRecord | null>;
  abstract consumeConnectionSession(id: string, status: string, metadata: Record<string, unknown>): Promise<IntegrationConnectionSessionRecord | null>;
}

import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { CredentialRecordStatus } from '../../contracts/enums.js';
import { CredentialRepository, ExternalIdentityRepository } from '../../application/ports/integrations.repository.js';
import { credentialFromRow, identityFromRow } from './row.mappers.js';
import { PostgresDatabase } from './database.js';

@Injectable()
export class PostgresIntegrationRepository extends CredentialRepository implements ExternalIdentityRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async listCredentials(userId: string, workspaceSlug: string) {
    const result = await this.database.getPool().query(
      'select * from kb_integration_credentials where user_id = $1 and workspace_slug = $2 order by provider',
      [userId, workspaceSlug],
    );
    return result.rows.map(credentialFromRow);
  }

  async upsertCredential(input: { userId: string; workspaceSlug: string; provider: string; status: string; encryptedConfig: unknown; publicMetadata: Record<string, unknown> }) {
    const result = await this.database.getPool().query(
      `insert into kb_integration_credentials (id, user_id, workspace_slug, provider, status, encrypted_config, public_metadata, revoked_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, null)
       on conflict (user_id, workspace_slug, provider)
       do update set
         status = excluded.status,
         encrypted_config = excluded.encrypted_config,
         public_metadata = excluded.public_metadata,
         updated_at = now(),
         revoked_at = null
       returning *`,
      [
        crypto.randomUUID(),
        input.userId,
        input.workspaceSlug,
        input.provider,
        input.status,
        JSON.stringify(input.encryptedConfig),
        JSON.stringify(input.publicMetadata),
      ],
    );
    return credentialFromRow(result.rows[0]);
  }

  async revokeCredential(userId: string, workspaceSlug: string, provider: string, encryptedConfig: unknown) {
    const result = await this.database.getPool().query(
      `update kb_integration_credentials
       set status = $4, encrypted_config = $5::jsonb, revoked_at = now(), updated_at = now()
       where user_id = $1 and workspace_slug = $2 and provider = $3
       returning *`,
      [userId, workspaceSlug, provider, CredentialRecordStatus.Revoked, JSON.stringify(encryptedConfig)],
    );
    return result.rows[0] ? credentialFromRow(result.rows[0]) : null;
  }

  async findCredential(userId: string, workspaceSlug: string, provider: string) {
    const result = await this.database.getPool().query(
      'select * from kb_integration_credentials where user_id = $1 and workspace_slug = $2 and provider = $3 limit 1',
      [userId, workspaceSlug, provider],
    );
    return result.rows[0] ? credentialFromRow(result.rows[0]) : null;
  }

  async findExternalIdentity(provider: string, identityType: string, externalId: string) {
    const result = await this.database.getPool().query(
      'select * from kb_external_identities where provider = $1 and identity_type = $2 and external_id = $3 limit 1',
      [provider, identityType, externalId],
    );
    return result.rows[0] ? identityFromRow(result.rows[0]) : null;
  }

  async upsertExternalIdentity(input: {
    userId: string;
    workspaceSlug: string;
    provider: string;
    identityType: string;
    externalId: string;
    credentialId?: string | null;
    verifiedAt?: string | null;
    metadata?: Record<string, unknown>;
    publicMetadata: Record<string, unknown>;
  }) {
    const result = await this.database.getPool().query(
      `insert into kb_external_identities (id, user_id, workspace_slug, provider, identity_type, external_id, credential_id, verified_at, metadata, public_metadata)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), $9::jsonb, $10::jsonb)
       on conflict (provider, identity_type, external_id)
       do update set
         user_id = excluded.user_id,
         workspace_slug = excluded.workspace_slug,
         credential_id = excluded.credential_id,
         verified_at = excluded.verified_at,
         metadata = excluded.metadata,
         public_metadata = excluded.public_metadata,
         updated_at = now()
       returning *`,
      [
        crypto.randomUUID(),
        input.userId,
        input.workspaceSlug,
        input.provider,
        input.identityType,
        input.externalId,
        input.credentialId || null,
        input.verifiedAt || null,
        JSON.stringify(input.metadata || {}),
        JSON.stringify(input.publicMetadata),
      ],
    );
    return identityFromRow(result.rows[0]);
  }
}

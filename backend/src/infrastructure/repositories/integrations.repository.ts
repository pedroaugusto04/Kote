import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and, desc, sql, isNull } from 'drizzle-orm';

import { CredentialRecordStatus } from '../../contracts/enums.js';
import { CredentialRepository, ExternalIdentityRepository, IntegrationConnectionSessionRepository } from '../../application/ports/integrations/integrations.repository.js';
import { connectionSessionFromRow, credentialFromRow, identityFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { integrationCredentials, externalIdentities, integrationConnectionSessions } from '../persistence/schema/index.js';

@Injectable()
export class PostgresIntegrationRepository extends CredentialRepository implements ExternalIdentityRepository, IntegrationConnectionSessionRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async listCredentials(userId: string, workspaceSlug: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(integrationCredentials)
      .where(and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.workspaceSlug, workspaceSlug)))
      .orderBy(integrationCredentials.provider);
    
    return result.map(credentialFromRow);
  }

  async upsertCredential(input: { userId: string; workspaceSlug: string; provider: string; status: string; encryptedConfig: unknown; publicMetadata: Record<string, unknown> }) {
    const db = this.database.getDb();
    const result = await db
      .insert(integrationCredentials)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        workspaceSlug: input.workspaceSlug,
        provider: input.provider,
        status: input.status as any,
        encryptedConfig: input.encryptedConfig,
        publicMetadata: input.publicMetadata,
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: [integrationCredentials.userId, integrationCredentials.workspaceSlug, integrationCredentials.provider],
        set: {
          status: input.status as any,
          encryptedConfig: input.encryptedConfig,
          publicMetadata: input.publicMetadata,
          updatedAt: new Date(),
          revokedAt: null,
        },
      })
      .returning();
    
    return credentialFromRow(result[0]);
  }

  async revokeCredential(userId: string, workspaceSlug: string, provider: string, encryptedConfig: unknown) {
    const db = this.database.getDb();
    const result = await db
      .update(integrationCredentials)
      .set({
        status: CredentialRecordStatus.Revoked,
        encryptedConfig: encryptedConfig,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(integrationCredentials.userId, userId),
        eq(integrationCredentials.workspaceSlug, workspaceSlug),
        eq(integrationCredentials.provider, provider)
      ))
      .returning();
    
    return result[0] ? credentialFromRow(result[0]) : null;
  }

  async findCredential(userId: string, workspaceSlug: string, provider: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(integrationCredentials)
      .where(and(
        eq(integrationCredentials.userId, userId),
        eq(integrationCredentials.workspaceSlug, workspaceSlug),
        eq(integrationCredentials.provider, provider)
      ))
      .limit(1);
    
    return result[0] ? credentialFromRow(result[0]) : null;
  }

  async findExternalIdentity(provider: string, identityType: string, externalId: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(externalIdentities)
      .where(and(
        eq(externalIdentities.provider, provider),
        eq(externalIdentities.identityType, identityType),
        eq(externalIdentities.externalId, externalId)
      ))
      .limit(1);
    
    return result[0] ? identityFromRow(result[0]) : null;
  }

  async deleteExternalIdentities(input: { userId: string; workspaceSlug: string; provider: string }) {
    const db = this.database.getDb();
    const result = await db
      .delete(externalIdentities)
      .where(and(
        eq(externalIdentities.userId, input.userId),
        eq(externalIdentities.workspaceSlug, input.workspaceSlug),
        eq(externalIdentities.provider, input.provider)
      ))
      .returning();
    
    return result.length;
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
    const db = this.database.getDb();
    const result = await db
      .insert(externalIdentities)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        workspaceSlug: input.workspaceSlug,
        provider: input.provider,
        identityType: input.identityType,
        externalId: input.externalId,
        credentialId: input.credentialId || null,
        verifiedAt: input.verifiedAt ? new Date(input.verifiedAt) : new Date(),
        metadata: input.metadata || {},
        publicMetadata: input.publicMetadata,
      })
      .onConflictDoUpdate({
        target: [externalIdentities.provider, externalIdentities.identityType, externalIdentities.externalId],
        set: {
          userId: input.userId,
          workspaceSlug: input.workspaceSlug,
          credentialId: input.credentialId || null,
          verifiedAt: input.verifiedAt ? new Date(input.verifiedAt) : sql`coalesce(${externalIdentities.verifiedAt}, now())`,
          metadata: input.metadata || {},
          publicMetadata: input.publicMetadata,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return identityFromRow(result[0]);
  }

  async createConnectionSession(input: {
    userId: string;
    workspaceSlug: string;
    provider: string;
    stateHash: string;
    verificationCodeHash: string;
    status: string;
    metadata: Record<string, unknown>;
    expiresAt: string;
  }) {
    const db = this.database.getDb();
    const result = await db
      .insert(integrationConnectionSessions)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        workspaceSlug: input.workspaceSlug,
        provider: input.provider,
        stateHash: input.stateHash,
        verificationCodeHash: input.verificationCodeHash,
        status: input.status,
        metadata: input.metadata || {},
        expiresAt: new Date(input.expiresAt),
      })
      .returning();
    
    return connectionSessionFromRow(result[0]);
  }

  async findConnectionSession(id: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(integrationConnectionSessions)
      .where(eq(integrationConnectionSessions.id, id))
      .limit(1);
    
    return result[0] ? connectionSessionFromRow(result[0]) : null;
  }

  async findActiveConnectionSessionByState(provider: string, stateHash: string, nowIso: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(integrationConnectionSessions)
      .where(and(
        eq(integrationConnectionSessions.provider, provider),
        eq(integrationConnectionSessions.stateHash, stateHash),
        eq(integrationConnectionSessions.status, 'pending'),
        isNull(integrationConnectionSessions.consumedAt),
        sql`${integrationConnectionSessions.expiresAt} > ${new Date(nowIso)}`
      ))
      .orderBy(desc(integrationConnectionSessions.createdAt))
      .limit(1);
    
    return result[0] ? connectionSessionFromRow(result[0]) : null;
  }

  async findActiveConnectionSessionByCode(provider: string, verificationCodeHash: string, nowIso: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(integrationConnectionSessions)
      .where(and(
        eq(integrationConnectionSessions.provider, provider),
        eq(integrationConnectionSessions.verificationCodeHash, verificationCodeHash),
        eq(integrationConnectionSessions.status, 'pending'),
        isNull(integrationConnectionSessions.consumedAt),
        sql`${integrationConnectionSessions.expiresAt} > ${new Date(nowIso)}`
      ))
      .orderBy(desc(integrationConnectionSessions.createdAt))
      .limit(1);
    
    return result[0] ? connectionSessionFromRow(result[0]) : null;
  }

  async consumeConnectionSession(id: string, status: string, metadata: Record<string, unknown>) {
    const db = this.database.getDb();
    const result = await db
      .update(integrationConnectionSessions)
      .set({
        status,
        metadata: sql`metadata || ${metadata}`,
        consumedAt: sql`coalesce(${integrationConnectionSessions.consumedAt}, now())`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(integrationConnectionSessions.id, id),
        isNull(integrationConnectionSessions.consumedAt)
      ))
      .returning();
    
    return result[0] ? connectionSessionFromRow(result[0]) : null;
  }
}

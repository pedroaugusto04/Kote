import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';

import { UserRepository } from '../../application/ports/auth/auth.repository.js';
import { authIdentityFromRow, userFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { users, authIdentities } from '../persistence/schema/index.js';

@Injectable()
export class PostgresUserRepository extends UserRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async findUserByEmail(email: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(users)
      .where(sql`lower(email) = lower(${email})`)
      .limit(1);
    
    return result[0] ? userFromRow(result[0]) : null;
  }

  async findUserById(id: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    
    return result[0] ? userFromRow(result[0]) : null;
  }

  async createUser(input: { email: string; displayName?: string; passwordHash?: string | null; role: string }) {
    const db = this.database.getDb();
    const result = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        email: input.email.trim().toLowerCase(),
        displayName: String(input.displayName || input.email.split('@')[0] || 'User').trim(),
        passwordHash: input.passwordHash || '',
        role: input.role,
      })
      .returning();
    
    return userFromRow(result[0]);
  }

  async updateUser(input: { userId: string; displayName?: string; cpfCnpj?: string }) {
    const db = this.database.getDb();
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    
    if (input.displayName !== undefined) {
      updateData.displayName = input.displayName;
    }
    if (input.cpfCnpj !== undefined) {
      updateData.cpfCnpj = input.cpfCnpj;
    }
    
    const result = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, input.userId))
      .returning();
    
    return result[0] ? userFromRow(result[0]) : null;
  }

  async updateUserAvatar(input: { userId: string; storageKey: string; mimeType: string; sizeBytes: number }) {
    const db = this.database.getDb();
    const result = await db
      .update(users)
      .set({ 
        avatar: input.storageKey,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.userId))
      .returning();
    
    return result[0] ? userFromRow(result[0]) : null;
  }

  async clearUserAvatar(userId: string) {
    const db = this.database.getDb();
    const result = await db
      .update(users)
      .set({ 
        avatar: '',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    return result[0] ? userFromRow(result[0]) : null;
  }

  async findAuthIdentity(provider: string, providerUserId: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(authIdentities)
      .where(and(eq(authIdentities.provider, provider), eq(authIdentities.providerUserId, providerUserId)))
      .limit(1);
    
    return result[0] ? authIdentityFromRow(result[0]) : null;
  }

  async findUserAuthIdentity(userId: string, provider: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, provider)))
      .limit(1);
    
    return result[0] ? authIdentityFromRow(result[0]) : null;
  }

  async createAuthIdentity(input: {
    provider: string;
    providerUserId: string;
    userId: string;
    email: string;
    emailVerified: boolean;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }) {
    const db = this.database.getDb();
    const result = await db
      .insert(authIdentities)
      .values({
        id: crypto.randomUUID(),
        provider: input.provider,
        providerUserId: input.providerUserId,
        userId: input.userId,
        email: input.email.trim().toLowerCase(),
        emailVerified: input.emailVerified,
        displayName: String(input.displayName || '').trim(),
        metadata: input.metadata || {},
      })
      .returning();
    
    return authIdentityFromRow(result[0]);
  }
}

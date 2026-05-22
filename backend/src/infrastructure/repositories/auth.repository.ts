import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { UserRepository } from '../../application/ports/auth.repository.js';
import { authIdentityFromRow, userFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';

@Injectable()
export class PostgresUserRepository extends UserRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async findUserByEmail(email: string) {
    const result = await this.database.getPool().query('select * from kb_users where lower(email) = lower($1) limit 1', [email]);
    return result.rows[0] ? userFromRow(result.rows[0]) : null;
  }

  async findUserById(id: string) {
    const result = await this.database.getPool().query('select * from kb_users where id = $1 limit 1', [id]);
    return result.rows[0] ? userFromRow(result.rows[0]) : null;
  }

  async createUser(input: { email: string; displayName?: string; passwordHash?: string | null; role: string }) {
    const result = await this.database.getPool().query(
      `insert into kb_users (id, email, display_name, password_hash, role)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        crypto.randomUUID(),
        input.email.trim().toLowerCase(),
        String(input.displayName || input.email.split('@')[0] || 'User').trim(),
        input.passwordHash ?? null,
        input.role,
      ],
    );
    return userFromRow(result.rows[0]);
  }

  async findAuthIdentity(provider: string, providerUserId: string) {
    const result = await this.database.getPool().query(
      `select * from kb_auth_identities
       where provider = $1 and provider_user_id = $2
       limit 1`,
      [provider, providerUserId],
    );
    return result.rows[0] ? authIdentityFromRow(result.rows[0]) : null;
  }

  async findUserAuthIdentity(userId: string, provider: string) {
    const result = await this.database.getPool().query(
      `select * from kb_auth_identities
       where user_id = $1 and provider = $2
       limit 1`,
      [userId, provider],
    );
    return result.rows[0] ? authIdentityFromRow(result.rows[0]) : null;
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
    const result = await this.database.getPool().query(
      `insert into kb_auth_identities (id, provider, provider_user_id, user_id, email, email_verified, display_name, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       returning *`,
      [
        crypto.randomUUID(),
        input.provider,
        input.providerUserId,
        input.userId,
        input.email.trim().toLowerCase(),
        input.emailVerified,
        String(input.displayName || '').trim(),
        JSON.stringify(input.metadata || {}),
      ],
    );
    return authIdentityFromRow(result.rows[0]);
  }
}

import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { UserRepository } from '../../application/ports/auth.repository.js';
import { userFromRow } from '../mappers/row.mappers.js';
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

  async createUser(input: { email: string; displayName?: string; passwordHash: string; role: string }) {
    const result = await this.database.getPool().query(
      `insert into kb_users (id, email, display_name, password_hash, role)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        crypto.randomUUID(),
        input.email.trim().toLowerCase(),
        String(input.displayName || input.email.split('@')[0] || 'User').trim(),
        input.passwordHash,
        input.role,
      ],
    );
    return userFromRow(result.rows[0]);
  }
}

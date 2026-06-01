import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PushSubscriptionRepository } from '../../application/ports/push/push-subscription.repository.js';
import type { PushSubscriptionRecord } from '../../application/models/repository-records.models.js';
import { pushSubscriptionFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';

@Injectable()
export class PostgresPushSubscriptionRepository extends PushSubscriptionRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async save(input: Omit<PushSubscriptionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PushSubscriptionRecord> {
    const id = crypto.randomUUID();
    const result = await this.database.getPool().query(
      `INSERT INTO kb_push_subscriptions (id, user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
       SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = now()
       RETURNING *`,
      [id, input.userId, input.endpoint, input.p256dh, input.auth],
    );
    return pushSubscriptionFromRow(result.rows[0]);
  }

  async deleteByEndpoint(userId: string, endpoint: string): Promise<boolean> {
    const result = await this.database.getPool().query(
      `DELETE FROM kb_push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
      [userId, endpoint],
    );
    return (result.rowCount || 0) > 0;
  }

  async listByUserId(userId: string): Promise<PushSubscriptionRecord[]> {
    const result = await this.database.getPool().query(
      `SELECT * FROM kb_push_subscriptions WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId],
    );
    return result.rows.map(pushSubscriptionFromRow);
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscriptionRecord | null> {
    const result = await this.database.getPool().query(
      `SELECT * FROM kb_push_subscriptions WHERE endpoint = $1`,
      [endpoint],
    );
    return result.rows[0] ? pushSubscriptionFromRow(result.rows[0]) : null;
  }
}

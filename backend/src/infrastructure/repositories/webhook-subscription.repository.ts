import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { WebhookSubscriptionRepository } from '../../application/ports/webhooks/webhook-subscription.repository.js';
import type { WebhookSubscriptionRecord } from '../../application/models/webhook-subscription.models.js';
import { webhookSubscriptionFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';

@Injectable()
export class PostgresWebhookSubscriptionRepository extends WebhookSubscriptionRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async list(userId: string, workspaceSlug: string): Promise<WebhookSubscriptionRecord[]> {
    const result = await this.database.getPool().query(
      `SELECT * FROM kb_webhook_subscriptions
       WHERE user_id = $1 AND workspace_slug = $2
       ORDER BY created_at ASC`,
      [userId, workspaceSlug],
    );
    return result.rows.map(webhookSubscriptionFromRow);
  }

  async findById(userId: string, id: string): Promise<WebhookSubscriptionRecord | null> {
    const result = await this.database.getPool().query(
      `SELECT * FROM kb_webhook_subscriptions WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return result.rows[0] ? webhookSubscriptionFromRow(result.rows[0]) : null;
  }

  async create(input: Omit<WebhookSubscriptionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<WebhookSubscriptionRecord> {
    const id = crypto.randomUUID();
    const result = await this.database.getPool().query(
      `INSERT INTO kb_webhook_subscriptions (id, user_id, workspace_slug, label, url, secret, events, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, input.userId, input.workspaceSlug, input.label, input.url, input.secret, input.events, input.enabled],
    );
    return webhookSubscriptionFromRow(result.rows[0]);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<Pick<WebhookSubscriptionRecord, 'label' | 'url' | 'secret' | 'events' | 'enabled'>>,
  ): Promise<WebhookSubscriptionRecord | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (input.label !== undefined) {
      setClauses.push(`label = $${paramIndex++}`);
      params.push(input.label);
    }
    if (input.url !== undefined) {
      setClauses.push(`url = $${paramIndex++}`);
      params.push(input.url);
    }
    if (input.secret !== undefined) {
      setClauses.push(`secret = $${paramIndex++}`);
      params.push(input.secret);
    }
    if (input.events !== undefined) {
      setClauses.push(`events = $${paramIndex++}`);
      params.push(input.events);
    }
    if (input.enabled !== undefined) {
      setClauses.push(`enabled = $${paramIndex++}`);
      params.push(input.enabled);
    }

    if (setClauses.length === 0) return this.findById(userId, id);

    setClauses.push(`updated_at = now()`);
    params.push(id, userId);

    const result = await this.database.getPool().query(
      `UPDATE kb_webhook_subscriptions
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING *`,
      params,
    );
    return result.rows[0] ? webhookSubscriptionFromRow(result.rows[0]) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.database.getPool().query(
      `DELETE FROM kb_webhook_subscriptions WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (result.rowCount || 0) > 0;
  }

  async findByEvent(userId: string, workspaceSlug: string, event: string): Promise<WebhookSubscriptionRecord[]> {
    const result = await this.database.getPool().query(
      `SELECT * FROM kb_webhook_subscriptions
       WHERE user_id = $1 AND workspace_slug = $2 AND enabled = TRUE AND $3 = ANY(events)`,
      [userId, workspaceSlug, event],
    );
    return result.rows.map(webhookSubscriptionFromRow);
  }
}

import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';

import { WebhookSubscriptionRepository } from '../../application/ports/webhooks/webhook-subscription.repository.js';
import type { WebhookSubscriptionRecord } from '../../application/models/webhook-subscription.models.js';
import { webhookSubscriptionFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { webhookSubscriptions } from '../persistence/schema/index.js';

@Injectable()
export class PostgresWebhookSubscriptionRepository extends WebhookSubscriptionRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async list(userId: string, workspaceSlug: string): Promise<WebhookSubscriptionRecord[]> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.userId, userId), eq(webhookSubscriptions.workspaceSlug, workspaceSlug)))
      .orderBy(webhookSubscriptions.createdAt);
    
    return result.map(webhookSubscriptionFromRow);
  }

  async findById(userId: string, id: string): Promise<WebhookSubscriptionRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.userId, userId)))
      .limit(1);
    
    return result[0] ? webhookSubscriptionFromRow(result[0]) : null;
  }

  async create(input: Omit<WebhookSubscriptionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<WebhookSubscriptionRecord> {
    const db = this.database.getDb();
    const result = await db
      .insert(webhookSubscriptions)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        workspaceSlug: input.workspaceSlug,
        label: input.label,
        url: input.url,
        secret: input.secret,
        events: input.events,
        enabled: input.enabled,
      })
      .returning();
    
    return webhookSubscriptionFromRow(result[0]);
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
    const db = this.database.getDb();
    const result = await db
      .delete(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.userId, userId)))
      .returning();
    
    return result.length > 0;
  }

  async findByEvent(userId: string, workspaceSlug: string, event: string): Promise<WebhookSubscriptionRecord[]> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(webhookSubscriptions)
      .where(and(
        eq(webhookSubscriptions.userId, userId),
        eq(webhookSubscriptions.workspaceSlug, workspaceSlug),
        eq(webhookSubscriptions.enabled, true),
        sql`${event} = ANY(events)`
      ));
    
    return result.map(webhookSubscriptionFromRow);
  }
}

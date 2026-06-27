import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';

import { WebhookSubscriptionRepository } from '../../application/ports/webhooks/webhook-subscription.repository.js';
import type { WebhookSubscriptionRecord } from '../../application/models/webhook-subscription.models.js';
import { webhookSubscriptionFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { webhookSubscriptions, workspaces } from '../persistence/schema/index.js';
import { resolveWorkspaceId } from './utils/id-resolution.helpers.js';

@Injectable()
export class PostgresWebhookSubscriptionRepository extends WebhookSubscriptionRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async list(userId: string, workspaceSlug: string): Promise<WebhookSubscriptionRecord[]> {
    const db = this.database.getDb();
    const result = await db
      .select({
        id: webhookSubscriptions.id,
        userId: webhookSubscriptions.userId,
        workspaceId: webhookSubscriptions.workspaceId,
        workspaceSlug: workspaces.workspaceSlug,
        label: webhookSubscriptions.label,
        url: webhookSubscriptions.url,
        secret: webhookSubscriptions.secret,
        events: webhookSubscriptions.events,
        enabled: webhookSubscriptions.enabled,
        createdAt: webhookSubscriptions.createdAt,
        updatedAt: webhookSubscriptions.updatedAt,
      })
      .from(webhookSubscriptions)
      .innerJoin(workspaces, eq(workspaces.id, webhookSubscriptions.workspaceId))
      .where(and(eq(webhookSubscriptions.userId, userId), eq(workspaces.workspaceSlug, workspaceSlug)))
      .orderBy(webhookSubscriptions.createdAt);
    
    return result.map(webhookSubscriptionFromRow);
  }

  async findById(userId: string, id: string): Promise<WebhookSubscriptionRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select({
        id: webhookSubscriptions.id,
        userId: webhookSubscriptions.userId,
        workspaceId: webhookSubscriptions.workspaceId,
        workspaceSlug: workspaces.workspaceSlug,
        label: webhookSubscriptions.label,
        url: webhookSubscriptions.url,
        secret: webhookSubscriptions.secret,
        events: webhookSubscriptions.events,
        enabled: webhookSubscriptions.enabled,
        createdAt: webhookSubscriptions.createdAt,
        updatedAt: webhookSubscriptions.updatedAt,
      })
      .from(webhookSubscriptions)
      .innerJoin(workspaces, eq(workspaces.id, webhookSubscriptions.workspaceId))
      .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.userId, userId)))
      .limit(1);
    
    return result[0] ? webhookSubscriptionFromRow(result[0]) : null;
  }

  async create(input: Omit<WebhookSubscriptionRecord, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'> & {
    workspaceId?: string;
    workspaceSlug?: string;
  }): Promise<WebhookSubscriptionRecord> {
    const db = this.database.getDb();
    let workspaceId = input.workspaceId;
    if (!workspaceId && input.workspaceSlug) {
      workspaceId = await resolveWorkspaceId(this.database, input.userId, input.workspaceSlug);
    }
    if (!workspaceId) {
      throw new Error('workspaceId or workspaceSlug is required');
    }
    const result = await db
      .insert(webhookSubscriptions)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        workspaceId,
        label: input.label,
        url: input.url,
        secret: input.secret,
        events: input.events,
        enabled: input.enabled,
      })
      .returning();
    
    return webhookSubscriptionFromRow({
      ...result[0],
      workspace_slug: input.workspaceSlug
    });
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

    await this.database.getPool().query(
      `UPDATE kb_webhook_subscriptions
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}`,
      params,
    );
    return this.findById(userId, id);
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
      .select({
        id: webhookSubscriptions.id,
        userId: webhookSubscriptions.userId,
        workspaceId: webhookSubscriptions.workspaceId,
        workspaceSlug: workspaces.workspaceSlug,
        label: webhookSubscriptions.label,
        url: webhookSubscriptions.url,
        secret: webhookSubscriptions.secret,
        events: webhookSubscriptions.events,
        enabled: webhookSubscriptions.enabled,
        createdAt: webhookSubscriptions.createdAt,
        updatedAt: webhookSubscriptions.updatedAt,
      })
      .from(webhookSubscriptions)
      .innerJoin(workspaces, eq(workspaces.id, webhookSubscriptions.workspaceId))
      .where(and(
        eq(webhookSubscriptions.userId, userId),
        eq(workspaces.workspaceSlug, workspaceSlug),
        eq(webhookSubscriptions.enabled, true),
        sql`${event} = ANY(${webhookSubscriptions.events})`
      ));
    
    return result.map(webhookSubscriptionFromRow);
  }
}

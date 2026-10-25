import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { eq, and, or, isNull, lt, notLike, sql } from 'drizzle-orm';

import { BillingWebhookEventRepository } from '../../../application/ports/billing/billing-repositories.js';
import type {
  GatewayWebhookEventRecord,
  WebhookEventCreateParams,
  WebhookEventCreateResult,
} from '../../../application/models/billing.models.js';
import { PostgresDatabase } from '../../persistence/database.js';
import { gatewayWebhookEvents } from '../../persistence/schema/index.js';

@Injectable()
export class PostgresBillingWebhookEventRepository extends BillingWebhookEventRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async createWebhookEventOnce(params: WebhookEventCreateParams): Promise<WebhookEventCreateResult> {
    const db = this.database.getDb();
    try {
      const result = await db
        .insert(gatewayWebhookEvents)
        .values({
          id: crypto.randomUUID(),
          gateway: params.gateway,
          dedupKey: params.dedupKey,
          eventType: params.eventType,
          gatewayEventId: params.gatewayEventId,
          gatewayPaymentId: params.gatewayPaymentId,
          gatewaySubscriptionId: params.gatewaySubscriptionId,
          payload: params.payload,
          status: 'pending',
          attempts: 0,
        })
        .returning();
      
      const row = result[0];
      return {
        id: row.id,
        created: true,
        status: row.status as 'pending' | 'processing' | 'done' | 'failed',
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('unique constraint') || (err && typeof err === 'object' && 'code' in err && err.code === '23505')) {
        const existing = await db
          .select({
            id: gatewayWebhookEvents.id,
            status: gatewayWebhookEvents.status,
          })
          .from(gatewayWebhookEvents)
          .where(
            and(
              eq(gatewayWebhookEvents.gateway, params.gateway),
              eq(gatewayWebhookEvents.dedupKey, params.dedupKey)
            )
          )
          .limit(1);
        
        if (existing.length > 0) {
          return {
            id: existing[0].id,
            created: false,
            status: existing[0].status as 'pending' | 'processing' | 'done' | 'failed',
          };
        }
      }
      throw err;
    }
  }

  async getWebhookEventById(id: string): Promise<GatewayWebhookEventRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(gatewayWebhookEvents)
      .where(eq(gatewayWebhookEvents.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return {
      ...result[0],
      payload: (result[0].payload || {}) as Record<string, unknown>,
    };
  }

  async markWebhookEventProcessing(id: string, maxAttempts: number): Promise<boolean> {
    const db = this.database.getDb();
    const result = await db
      .update(gatewayWebhookEvents)
      .set({
        status: 'processing',
        attempts: sql`${gatewayWebhookEvents.attempts} + 1`,
        lastDispatchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(gatewayWebhookEvents.id, id),
          or(
            eq(gatewayWebhookEvents.status, 'pending'),
            eq(gatewayWebhookEvents.status, 'failed')
          ),
          lt(gatewayWebhookEvents.attempts, maxAttempts)
        )
      )
      .returning();

    return result.length > 0;
  }

  async markWebhookEventDone(id: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(gatewayWebhookEvents)
      .set({
        status: 'done',
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(gatewayWebhookEvents.id, id));
  }

  async markWebhookEventFailed(id: string, error: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(gatewayWebhookEvents)
      .set({
        status: 'failed',
        lastError: error,
        updatedAt: new Date(),
      })
      .where(eq(gatewayWebhookEvents.id, id));
  }

  async markWebhookEventAlerted(id: string, alertMarker: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(gatewayWebhookEvents)
      .set({
        lastError: sql`concat(${gatewayWebhookEvents.lastError}, ' ', ${alertMarker}::text)`,
        updatedAt: new Date(),
      })
      .where(eq(gatewayWebhookEvents.id, id));
  }

  async listWebhookEventsForReplay(options: {
    minAgeSeconds: number;
    maxAttempts: number;
    batchSize: number;
  }): Promise<GatewayWebhookEventRecord[]> {
    const db = this.database.getDb();
    const minAgeDate = new Date();
    minAgeDate.setSeconds(minAgeDate.getSeconds() - options.minAgeSeconds);

    const rows = await db
      .select()
      .from(gatewayWebhookEvents)
      .where(and(
        or(
          eq(gatewayWebhookEvents.status, 'pending'),
          eq(gatewayWebhookEvents.status, 'failed')
        ),
        lt(gatewayWebhookEvents.attempts, options.maxAttempts),
        or(
          isNull(gatewayWebhookEvents.lastDispatchedAt),
          lt(gatewayWebhookEvents.lastDispatchedAt, minAgeDate)
        )
      ))
      .limit(options.batchSize);

    return rows.map((row) => ({
      ...row,
      payload: (row.payload || {}) as Record<string, unknown>,
    }));
  }

  async markWebhookEventDispatched(id: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(gatewayWebhookEvents)
      .set({
        lastDispatchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(gatewayWebhookEvents.id, id));
  }

  async listWebhookEventsAtAttemptLimit(options: {
    maxAttempts: number;
    batchSize: number;
    alertMarker: string;
  }): Promise<GatewayWebhookEventRecord[]> {
    const db = this.database.getDb();
    const rows = await db
      .select()
      .from(gatewayWebhookEvents)
      .where(and(
        eq(gatewayWebhookEvents.status, 'failed'),
        eq(gatewayWebhookEvents.attempts, options.maxAttempts),
        or(
          isNull(gatewayWebhookEvents.lastError),
          notLike(gatewayWebhookEvents.lastError, `%${options.alertMarker}%`)
        )
      ))
      .limit(options.batchSize);

    return rows.map((row) => ({
      ...row,
      payload: (row.payload || {}) as Record<string, unknown>,
    }));
  }
}

import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';

import { WebhookEventRepository } from '../../application/ports/webhooks/webhook-events.repository.js';
import { sanitizeWebhookHeaders, sanitizeWebhookValue } from '../../application/utils/webhook/webhook.utils.js';
import { webhookEventFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { webhookIdempotencyKeys, webhookEvents } from '../persistence/schema/index.js';

@Injectable()
export class PostgresWebhookEventRepository extends WebhookEventRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async claimWebhookIdempotency(input: {
    provider: string;
    eventType: string;
    idempotencyKey: string;
    resolvedUserId?: string | null;
  }) {
    const db = this.database.getDb();
    const result = await db
      .insert(webhookIdempotencyKeys)
      .values({
        provider: input.provider,
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        resolvedUserId: input.resolvedUserId || null,
      })
      .onConflictDoNothing()
      .returning();

    return result.length > 0;
  }

  async recordWebhookEvent(input: {
    provider: string;
    eventType: string;
    status: string;
    resolvedUserId?: string | null;
    externalIdentity?: Record<string, unknown>;
    rawHeaders?: Record<string, unknown>;
    rawPayload?: unknown;
    error?: string;
  }) {
    const db = this.database.getDb();
    const result = await db
      .insert(webhookEvents)
      .values({
        id: crypto.randomUUID(),
        provider: input.provider,
        eventType: input.eventType,
        status: input.status,
        resolvedUserId: input.resolvedUserId || null,
        externalIdentity: input.externalIdentity || {},
        rawHeaders: sanitizeWebhookHeaders(input.rawHeaders || {}),
        rawPayload: sanitizeWebhookValue(input.rawPayload || {}),
        error: input.error || '',
      })
      .returning();
    
    return webhookEventFromRow(result[0]);
  }
}

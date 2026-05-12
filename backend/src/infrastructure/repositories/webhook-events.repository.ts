import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { WebhookEventRepository } from '../../application/ports/webhook-events.repository.js';
import { sanitizeWebhookHeaders, sanitizeWebhookValue } from '../../application/utils/webhook.utils.js';
import { webhookEventFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';

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
    externalIdentity?: Record<string, unknown>;
    rawHeaders?: Record<string, unknown>;
    rawPayload?: unknown;
  }) {
    const result = await this.database.getPool().query(
      `insert into kb_webhook_idempotency_keys (
         provider,
         event_type,
         idempotency_key,
         resolved_user_id,
         external_identity,
         raw_headers,
         raw_payload
       )
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
       on conflict (provider, event_type, idempotency_key) do nothing
       returning idempotency_key`,
      [
        input.provider,
        input.eventType,
        input.idempotencyKey,
        input.resolvedUserId || null,
        JSON.stringify(input.externalIdentity || {}),
        JSON.stringify(sanitizeWebhookHeaders(input.rawHeaders || {})),
        JSON.stringify(sanitizeWebhookValue(input.rawPayload || {})),
      ],
    );
    return (result.rowCount || 0) > 0;
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
    const result = await this.database.getPool().query(
      `insert into kb_webhook_events (id, provider, event_type, status, resolved_user_id, external_identity, raw_headers, raw_payload, error)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)
       returning *`,
      [
        crypto.randomUUID(),
        input.provider,
        input.eventType,
        input.status,
        input.resolvedUserId || null,
        JSON.stringify(input.externalIdentity || {}),
        JSON.stringify(sanitizeWebhookHeaders(input.rawHeaders || {})),
        JSON.stringify(sanitizeWebhookValue(input.rawPayload || {})),
        input.error || '',
      ],
    );
    return webhookEventFromRow(result.rows[0]);
  }
}

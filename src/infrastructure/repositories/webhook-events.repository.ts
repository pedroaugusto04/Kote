import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { WebhookEventRepository } from '../../application/ports/webhook-events.repository.js';
import { webhookEventFromRow } from './row.mappers.js';
import { PostgresDatabase } from './database.js';

@Injectable()
export class PostgresWebhookEventRepository extends WebhookEventRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
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
        JSON.stringify(input.rawHeaders || {}),
        JSON.stringify(input.rawPayload || {}),
        input.error || '',
      ],
    );
    return webhookEventFromRow(result.rows[0]);
  }
}

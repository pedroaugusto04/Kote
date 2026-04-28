import type { WebhookEventRecord, WebhookEventStatus } from '../models/repository-records.models.js';

export abstract class WebhookEventRepository {
  abstract recordWebhookEvent(input: {
    provider: string;
    eventType: string;
    status: WebhookEventStatus;
    resolvedUserId?: string | null;
    externalIdentity?: Record<string, unknown>;
    rawHeaders?: Record<string, unknown>;
    rawPayload?: unknown;
    error?: string;
  }): Promise<WebhookEventRecord>;
}

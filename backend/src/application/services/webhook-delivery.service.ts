import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { WebhookSubscriptionRecord } from '../models/webhook-subscription.models.js';
import type { NoteEventPayload } from '../../domain/note-event.js';
import { AppLogger } from '../../observability/logger.js';

@Injectable()
export class WebhookDeliveryService {
  constructor(private readonly logger: AppLogger) {}

  async deliver(subscription: WebhookSubscriptionRecord, payload: NoteEventPayload): Promise<void> {
    const body = JSON.stringify(payload);
    const deliveryId = crypto.randomUUID();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-KB-Event': payload.event,
      'X-KB-Delivery-Id': deliveryId,
    };

    if (subscription.secret) {
      const signature = crypto
        .createHmac('sha256', subscription.secret)
        .update(body)
        .digest('hex');
      headers['X-KB-Signature-256'] = `sha256=${signature}`;
    }

    const response = await fetch(subscription.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      this.logger.warn('webhook.delivery_http_error', {
        subscriptionId: subscription.id,
        event: payload.event,
        statusCode: response.status,
        deliveryId,
      });
      throw new Error(`webhook_delivery_http_${response.status}`);
    }

    this.logger.info('webhook.delivery_success', {
      subscriptionId: subscription.id,
      event: payload.event,
      deliveryId,
    });
  }
}

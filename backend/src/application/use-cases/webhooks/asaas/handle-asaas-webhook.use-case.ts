import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import crypto from 'node:crypto';
import { BillingWebhookEventRepository } from '../../../ports/billing/billing-repositories.js';
import { BillingQueuePublisher } from '../../../ports/billing/billing-queue.publisher.js';

@Injectable()
export class HandleAsaasWebhookUseCase {
  private readonly logger = new Logger(HandleAsaasWebhookUseCase.name);

  constructor(
    private readonly webhookEventRepository: BillingWebhookEventRepository,
    private readonly queuePublisher: BillingQueuePublisher,
  ) {}

  async execute(body: any, headers: Record<string, string | string[] | undefined>) {
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expectedToken) {
      this.logger.error('ASAAS_WEBHOOK_TOKEN is not configured. Webhook rejected.');
      throw new UnauthorizedException('Unauthorized webhook');
    }

    const rawToken =
      headers['asaas-access-token'] ??
      headers['asaas_access_token'] ??
      headers['access-token'] ??
      headers['access_token'];
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

    if (!token || String(token) !== String(expectedToken)) {
      throw new UnauthorizedException('Unauthorized webhook');
    }

    const eventType = String(body?.event ?? 'unknown');
    const gatewayEventId = body?.id ? String(body.id) : null;

    // Fallback deduplication key using SHA-256 hash of body if event id is missing
    const dedupKey = gatewayEventId || crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');

    const payment = body?.payment;
    const subscription = body?.subscription;

    const gatewayPaymentId = payment?.id ? String(payment.id) : null;
    const gatewaySubscriptionId = payment?.subscription
      ? String(payment.subscription)
      : (subscription?.id ? String(subscription.id) : null);

    // Save event to database once for idempotency
    const savedEvent = await this.webhookEventRepository.createWebhookEventOnce({
      gateway: 'asaas',
      dedupKey,
      eventType,
      gatewayEventId,
      gatewayPaymentId,
      gatewaySubscriptionId,
      payload: body,
    });

    if (savedEvent.status === 'done') {
      return { success: true, duplicated: true };
    }

    try {
      await this.queuePublisher.publishWebhookEventId(savedEvent.id);
    } catch (err) {
      this.logger.error(`Failed to publish Asaas webhook event ID ${savedEvent.id} to RabbitMQ`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { success: true };
  }
}

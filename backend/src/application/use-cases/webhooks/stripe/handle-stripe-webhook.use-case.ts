import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { BillingWebhookEventRepository } from '../../../ports/billing/billing-repositories.js';
import { BillingQueuePublisher } from '../../../ports/billing/billing-queue.publisher.js';
import { PAYMENT_GATEWAY } from '../../../../domain/constants/billing.constants.js';
import {
  buildStripeDedupKey,
  extractStripeEventIds,
  verifyStripeWebhookSignature,
} from '../../../utils/webhook/stripe-webhook.utils.js';

@Injectable()
export class HandleStripeWebhookUseCase {
  private readonly logger = new Logger(HandleStripeWebhookUseCase.name);

  constructor(
    private readonly webhookEventRepository: BillingWebhookEventRepository,
    private readonly queuePublisher: BillingQueuePublisher,
  ) {}

  async execute(body: any, headers: Record<string, string | string[] | undefined>, rawBodyStr?: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (webhookSecret) {
      const sigHeader = headers['stripe-signature'];
      const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

      if (!signature) {
        throw new UnauthorizedException('missing_webhook_signature');
      }

      const isValid = verifyStripeWebhookSignature(rawBodyStr || JSON.stringify(body), signature, webhookSecret);
      if (!isValid) {
        throw new UnauthorizedException('invalid_webhook_signature');
      }
    }

    const eventType = String(body?.type ?? 'unknown');
    const gatewayEventId = body?.id ? String(body.id) : null;
    const dedupKey = buildStripeDedupKey(body, gatewayEventId);
    const { gatewayPaymentId, gatewaySubscriptionId } = extractStripeEventIds(body, eventType);

    const savedEvent = await this.webhookEventRepository.createWebhookEventOnce({
      gateway: PAYMENT_GATEWAY.STRIPE,
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
      this.logger.error(`Failed to publish Stripe webhook event ID ${savedEvent.id} to RabbitMQ`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return { success: true };
  }
}

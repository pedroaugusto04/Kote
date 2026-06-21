import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import crypto from 'node:crypto';
import { BillingWebhookEventRepository } from '../../../ports/billing/billing-repositories.js';
import { BillingQueuePublisher } from '../../../ports/billing/billing-queue.publisher.js';
import { GATEWAY_NAMES } from '../../../services/billing-stubs.service.js';

@Injectable()
export class HandleStripeWebhookUseCase {
  private readonly logger = new Logger(HandleStripeWebhookUseCase.name);

  constructor(
    private readonly webhookEventRepository: BillingWebhookEventRepository,
    private readonly queuePublisher: BillingQueuePublisher,
  ) {}

  async execute(body: any, headers: Record<string, string | string[] | undefined>, rawBodyStr?: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    // Validate signature if webhookSecret is configured
    if (webhookSecret) {
      const sigHeader = headers['stripe-signature'];
      const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      
      if (!signature) {
        throw new UnauthorizedException('Missing Stripe signature');
      }

      const isValid = this.verifySignature(rawBodyStr || JSON.stringify(body), signature, webhookSecret);
      if (!isValid) {
        throw new UnauthorizedException('Invalid Stripe signature');
      }
    }

    const eventType = String(body?.type ?? 'unknown');
    const gatewayEventId = body?.id ? String(body.id) : null;

    // Fallback deduplication key using SHA-256 hash of body if event id is missing
    const dedupKey = gatewayEventId || crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');

    const dataObject = body?.data?.object;
    const gatewayPaymentId = dataObject?.id && eventType.startsWith('invoice.') ? String(dataObject.id) : null;
    const gatewaySubscriptionId = dataObject?.subscription ? String(dataObject.subscription) : null;

    // Save event to database once for idempotency
    const savedEvent = await this.webhookEventRepository.createWebhookEventOnce({
      gateway: GATEWAY_NAMES.STRIPE,
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

  private verifySignature(payload: string, header: string, secret: string): boolean {
    try {
      const parts = header.split(',');
      let timestamp = '';
      const signatures: string[] = [];

      for (const part of parts) {
        const [key, val] = part.split('=');
        if (key === 't') timestamp = val;
        if (key === 'v1') signatures.push(val);
      }

      if (!timestamp || signatures.length === 0) {
        return false;
      }

      const signedPayload = `${timestamp}.${payload}`;
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(signedPayload);
      const expectedSignature = hmac.digest('hex');

      return signatures.includes(expectedSignature);
    } catch {
      return false;
    }
  }
}

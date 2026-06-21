import crypto from 'node:crypto';
import { Controller, Post, Body, Req, Headers, UnauthorizedException, Logger, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { type Request } from 'express';

import { BillingWebhookEventRepository } from '../../../../application/ports/billing/billing-repositories.js';
import { BillingQueuePublisher } from '../../../../application/ports/billing/billing-queue.publisher.js';
import { WebhookRateLimitGuard } from '../../auth.guards.js';

@ApiTags('Billing Webhooks')
@Controller('api/webhooks/asaas')
@UseGuards(WebhookRateLimitGuard)
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  constructor(
    private readonly webhookEventRepository: BillingWebhookEventRepository,
    private readonly queuePublisher: BillingQueuePublisher,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Asaas payment gateway webhook event' })
  @ApiResponse({ status: 200, description: 'Webhook received and processed/enqueued' })
  async handleWebhook(
    @Body() body: any,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
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
      // We still return 200 to Asaas so it doesn't retry delivering the same payload endlessly.
      // Since it is saved as 'pending' in the DB, it can be replayed or processed via recovery worker.
    }

    return { success: true };
  }
}

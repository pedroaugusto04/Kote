import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import amqplib, { type ChannelModel, type Channel, type Message } from 'amqplib';

import {
  BillingCustomerRepository,
  BillingPaymentRepository,
  BillingWebhookEventRepository,
} from '../../../application/ports/billing/billing-repositories.js';
import { AsaasPaymentGateway } from '../gateways/asaas/AsaasPaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../gateways/asaas/AsaasGatewayStatusMapper.js';
import { SubscriptionService, BillingIntentService } from '../../../application/services/billing-stubs.service.js';
import { AppLogger } from '../../../observability/logger.js';
import { BillingEventBus } from '../../../application/services/billing-event.bus.js';
import {
  parseDateTimeInput,
  toMoneyNumber,
  parseExternalReference,
} from '../gateways/asaas/AsaasHelpers.js';
import {
  type PaymentGateway,
  type PaymentStatus,
  type PaymentKind,
} from '../../../infrastructure/persistence/schema/index.js';
import { BillingTypeEnum } from '../gateways/IPaymentGateway.js';

const RECONNECT_DELAY_MS = 5_000;

// Constants for processing states
const WEBHOOK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed',
} as const;

const PAYMENT_KIND = {
  UPGRADE: 'upgrade',
  RECURRING: 'recurring',
} as const;

const SYSTEM_GATEWAY = 'asaas' as const;

@Injectable()
export class BillingWebhookConsumer implements OnModuleInit, OnModuleDestroy {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connecting = false;
  private closed = false;

  private readonly exchange: string;
  private readonly queue: string;
  private readonly routingKey: string;
  private readonly retryExchange: string;
  private readonly retryQueue: string;
  private readonly retryRoutingKey: string;

  private readonly retryBaseDelayMs: number;
  private readonly maxRetries: number;
  private readonly maxWebhookAttempts: number;

  constructor(
    private readonly customerRepository: BillingCustomerRepository,
    private readonly paymentRepository: BillingPaymentRepository,
    private readonly webhookEventRepository: BillingWebhookEventRepository,
    private readonly paymentGateway: AsaasPaymentGateway,
    private readonly gatewayStatusMapper: AsaasGatewayStatusMapper,
    private readonly subscriptionService: SubscriptionService,
    private readonly billingIntentService: BillingIntentService,
    private readonly billingEventBus: BillingEventBus,
    private readonly logger: AppLogger
  ) {
    this.exchange = process.env.KB_RABBITMQ_BILLING_EXCHANGE || 'billing.webhooks';
    this.queue = process.env.KB_RABBITMQ_BILLING_QUEUE || 'billing.webhooks.asaas';
    this.routingKey = process.env.KB_RABBITMQ_BILLING_ROUTING_KEY || 'asaas.webhook';

    this.retryExchange = `${this.exchange}.retry`;
    this.retryQueue = `${this.queue}.retry`;
    this.retryRoutingKey = `${this.routingKey}.retry`;

    this.retryBaseDelayMs = Number(process.env.RABBITMQ_RETRY_DELAY_MS || '15000');
    this.maxRetries = Number(process.env.RABBITMQ_MAX_RETRIES || '5');
    this.maxWebhookAttempts = Number(process.env.WEBHOOK_MAX_ATTEMPTS || '10');
  }

  async onModuleInit() {
    const url = this.getUrl();
    if (!url) {
      this.logger.warn('billing_webhook_consumer.skipped_no_url');
      return;
    }
    void this.start(url);
  }

  async onModuleDestroy() {
    this.closed = true;
    try {
      if (this.channel) await this.channel.close();
    } catch { /* already closed */ }
    try {
      if (this.connection) await this.connection.close();
    } catch { /* already closed */ }
    this.channel = null;
    this.connection = null;
  }

  private getUrl(): string {
    return String(process.env.KB_RABBITMQ_URL || '').trim();
  }

  private async start(url: string) {
    try {
      const channel = await this.ensureChannel(url);
      await channel.prefetch(1);
      await channel.consume(this.queue, (msg) => this.processMessage(msg, channel));
      this.logger.info('billing_webhook_consumer.started');
    } catch (error) {
      this.logger.error('billing_webhook_consumer.start_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!this.closed) {
        setTimeout(() => this.start(url), RECONNECT_DELAY_MS);
      }
    }
  }

  private async ensureChannel(url: string): Promise<Channel> {
    if (this.channel) return this.channel;
    if (this.connecting) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (this.channel) return this.channel;
      throw new Error('billing_webhook_consumer.connection_in_progress');
    }

    this.connecting = true;
    try {
      const conn = await amqplib.connect(url);
      this.connection = conn;

      conn.on('error', (error: Error) => {
        this.logger.error('billing_webhook_consumer.connection_error', { error: error.message });
        this.channel = null;
      });
      conn.on('close', () => {
        this.channel = null;
        if (!this.closed) {
          this.logger.warn('billing_webhook_consumer.connection_closed_reconnecting');
        }
      });

      const ch = await conn.createChannel();

      // Main flow Setup
      await ch.assertExchange(this.exchange, 'topic', { durable: true });
      await ch.assertQueue(this.queue, { durable: true });
      await ch.bindQueue(this.queue, this.exchange, this.routingKey);

      // Retry flow Setup
      await ch.assertExchange(this.retryExchange, 'topic', { durable: true });
      await ch.assertQueue(this.retryQueue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': this.exchange,
          'x-dead-letter-routing-key': this.routingKey,
        },
      });
      await ch.bindQueue(this.retryQueue, this.retryExchange, this.retryRoutingKey);

      this.channel = ch;
      return ch;
    } finally {
      this.connecting = false;
    }
  }

  private async processMessage(msg: Message | null, channel: Channel) {
    if (!msg) return;

    let webhookEventId: string | null = null;

    try {
      const content = JSON.parse(msg.content.toString());
      webhookEventId = content?.webhookEventId;

      if (!webhookEventId) {
        throw new Error('Invalid message: webhookEventId missing');
      }

      const claimed = await this.webhookEventRepository.markWebhookEventProcessing(
        webhookEventId,
        this.maxWebhookAttempts
      );
      if (!claimed) {
        channel.ack(msg);
        return;
      }

      this.logger.info('billing_webhook_consumer.processing', { webhookEventId });

      await this.handleWebhookLogic(webhookEventId);

      await this.webhookEventRepository.markWebhookEventDone(webhookEventId);
      channel.ack(msg);
    } catch (error) {
      const safeErrorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('billing_webhook_consumer.error_processing', {
        webhookEventId,
        error: safeErrorMessage,
      });

      if (webhookEventId) {
        try {
          await this.webhookEventRepository.markWebhookEventFailed(webhookEventId, safeErrorMessage);
          await this.notifyAttemptLimitIfNeeded(webhookEventId);
        } catch (markError) {
          this.logger.error('billing_webhook_consumer.failed_to_mark_failed', {
            webhookEventId,
            error: markError instanceof Error ? markError.message : String(markError),
          });
        }
      }

      try {
        const currentRetryAttempt = this.getRetryAttempt(msg);
        const nextRetryAttempt = currentRetryAttempt + 1;

        if (nextRetryAttempt > this.maxRetries) {
          this.logger.error('billing_webhook_consumer.max_retries_exceeded_giving_up', {
            webhookEventId,
            retries: currentRetryAttempt,
          });
          channel.ack(msg);
          return;
        }

        const backoffMs = this.retryBaseDelayMs * Math.pow(2, Math.max(0, currentRetryAttempt));
        channel.publish(this.retryExchange, this.retryRoutingKey, msg.content, {
          persistent: true,
          expiration: String(backoffMs),
          headers: {
            ...(msg.properties.headers ?? {}),
            'x-retry-attempt': nextRetryAttempt,
            'x-last-error': safeErrorMessage,
          },
        });

        channel.ack(msg);
      } catch (retryPublishError) {
        this.logger.error('billing_webhook_consumer.failed_to_requeue', {
          webhookEventId,
          error: retryPublishError instanceof Error ? retryPublishError.message : String(retryPublishError),
        });
        channel.nack(msg, false, true);
      }
    }
  }

  private async handleWebhookLogic(webhookEventId: string) {
    const webhookRecord = await this.webhookEventRepository.getWebhookEventById(webhookEventId);
    if (!webhookRecord) {
      throw new Error(`WebhookEvent not found in database: ${webhookEventId}`);
    }

    if (!webhookRecord.payload || typeof webhookRecord.payload !== 'object') {
      throw new Error(`Invalid webhook payload for eventId=${webhookEventId}`);
    }

    const event = this.paymentGateway.parseWebhook(webhookRecord.payload);
    const payment = event.payment;

    if (!payment?.id) {
      this.logger.info('billing_webhook_consumer.ignored_no_payment_id', { eventType: event.event });
      return;
    }

    const gatewayPaymentId = String(payment.id);
    const gateway = webhookRecord.gateway;

    const payStatus = this.gatewayStatusMapper.normalizePaymentStatus(payment.status, event.event);
    if (!payStatus) {
      this.logger.warn('billing_webhook_consumer.ignored_unknown_status', {
        status: payment.status,
        eventType: event.event,
      });
      return;
    }

    // Resolve userId using helper
    const rawPayload = webhookRecord.payload as any;
    const gatewayCustomerId = rawPayload?.payment?.customer || rawPayload?.customer;
    const userId = await this.resolveUserId(gateway, gatewayCustomerId, payment.externalReference);

    if (!userId) {
      throw new Error(`Could not resolve userId for payment ${gatewayPaymentId}`);
    }

    // Sync payment records
    const existingPayment = await this.paymentRepository.getSubscriptionPaymentByGatewayPaymentId(gateway, gatewayPaymentId);
    const eventCreatedAt = parseDateTimeInput(event.eventCreatedAt);
    const lastAppliedEventAt = existingPayment?.lastGatewayEventAt;

    if (existingPayment && eventCreatedAt && lastAppliedEventAt && eventCreatedAt <= lastAppliedEventAt) {
      this.logger.info('billing_webhook_consumer.ignored_out_of_order', {
        gatewayPaymentId,
        eventCreatedAt,
        lastAppliedEventAt,
      });
      return;
    }

    const dueDate = parseDateTimeInput(payment.dueDate) ?? new Date();
    const paidAt = parseDateTimeInput(payment.paidAt);
    const value = toMoneyNumber(payment.value ?? 0);

    const intent = await this.resolveIntent(payment.externalReference);

    const paymentData = {
      subscriptionId: userId,
      userId,
      gateway,
      gatewayPaymentId,
      status: payStatus,
      billingType: (payment.billingType as any) || null,
      kind: existingPayment?.kind || (intent?.type === 'upgrade' ? PAYMENT_KIND.UPGRADE : PAYMENT_KIND.RECURRING) as PaymentKind,
      gatewayStatus: payment.status || null,
      value,
      dueDate,
      paidAt,
      invoiceUrl: payment.invoiceUrl || null,
      bankSlipUrl: payment.bankSlipUrl || null,
      pixQrCode: payment.pixQrCode || null,
      pixQrCodeUrl: payment.pixQrCodeUrl || null,
      description: payment.description || null,
      lastGatewayEventAt: eventCreatedAt,
    };

    await this.paymentRepository.upsertSubscriptionPayment(paymentData);

    // Guard/Early return for cancellations/refunds
    if (payStatus === 'canceled' || payStatus === 'refunded' || payStatus === 'partially_refunded') {
      if (intent && (intent.status === 'pending' || intent.status === 'processing')) {
        await this.billingIntentService.markCanceled(userId, intent.id);
      }
      await this.subscriptionService.refreshSubscriptionFromPayments({
        subscriptionId: userId,
        gatewaySubscriptionId: payment.subscription,
        userId,
        status: payStatus,
      });
      this.billingEventBus.emit(userId);
      return;
    }

    // Handle payment confirmations
    if (payStatus === 'confirmed' || payStatus === 'received') {
      const creditCardToken = await this.resolveAndSyncCreditCardToken(userId, gateway, gatewayPaymentId, payment, intent);

      if (intent && (intent.status === 'pending' || intent.status === 'processing')) {
        const claimedIntent = await this.billingIntentService.claimForProcessing(userId, intent.id);
        if (claimedIntent) {
          await this.processIntentPayload(userId, gatewayCustomerId, payment, intent, paidAt, creditCardToken);
        }
      }
    }

    await this.subscriptionService.refreshSubscriptionFromPayments({
      subscriptionId: userId,
      gatewaySubscriptionId: payment.subscription,
      userId,
      status: payStatus,
    });
    this.billingEventBus.emit(userId);
  }

  // --- Helper Methods ---

  private async resolveUserId(
    gateway: PaymentGateway,
    gatewayCustomerId?: string | null,
    externalReference?: string | null
  ): Promise<string | null> {
    if (gatewayCustomerId) {
      const customerRecord = await this.customerRepository.getCustomerByGatewayId(gateway, gatewayCustomerId);
      if (customerRecord?.userId) {
        return customerRecord.userId;
      }
    }

    if (externalReference) {
      try {
        const parsedRef = parseExternalReference(externalReference);
        const resolved = await this.billingIntentService.resolveIntentFromExternalReference(externalReference);
        if (resolved.intent?.userId) {
          return resolved.intent.userId;
        }
      } catch (err) {
        this.logger.warn('billing_webhook_consumer.resolve_userid_failed', {
          ref: externalReference,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return null;
  }

  private async resolveIntent(externalReference?: string | null): Promise<any | null> {
    if (!externalReference) return null;
    try {
      const resolved = await this.billingIntentService.resolveIntentFromExternalReference(externalReference);
      return resolved.intent;
    } catch {
      return null;
    }
  }

  private async resolveAndSyncCreditCardToken(
    userId: string,
    gateway: PaymentGateway,
    gatewayPaymentId: string,
    payment: any,
    intent: any
  ): Promise<string | undefined> {
    if (payment.billingType !== BillingTypeEnum.CREDIT_CARD) {
      return undefined;
    }

    let creditCardToken = payment.creditCardToken || intent?.creditCardToken;
    if (!creditCardToken) {
      try {
        const gatewayPayment = await this.paymentGateway.getPaymentByGatewayId(gatewayPaymentId);
        creditCardToken = gatewayPayment?.creditCardToken;
      } catch (err) {
        this.logger.error('billing_webhook_consumer.cc_fetch_failed', {
          gatewayPaymentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!creditCardToken) {
      creditCardToken = await this.customerRepository.getCreditCardToken(userId, gateway);
    }

    if (creditCardToken) {
      await this.customerRepository.markCreditCardOnFile(userId, gateway, creditCardToken);
    }

    return creditCardToken;
  }

  private async processIntentPayload(
    userId: string,
    gatewayCustomerId: string | undefined,
    payment: any,
    intent: any,
    paidAt: Date | null,
    creditCardToken?: string
  ): Promise<void> {
    if (intent.type === 'new') {
      await this.subscriptionService.createNewSubscription({
        gatewayCustomerId: gatewayCustomerId || '',
        userId,
        targetPlanId: intent.planId || '',
        billingCycle: intent.billingCycle || 'monthly',
        billingType: payment.billingType ? (payment.billingType.toLowerCase() as any) : undefined,
        activationDate: paidAt || new Date(),
        creditCardToken,
        createdFromIntentId: intent.id,
      });
      return;
    }

    if (intent.type === 'upgrade') {
      await this.subscriptionService.confirmUpgrade(userId, intent.planId || '');
      await this.billingIntentService.markDone(userId, intent.id);
    }
  }

  private async notifyAttemptLimitIfNeeded(webhookEventId: string) {
    try {
      const event = await this.webhookEventRepository.getWebhookEventById(webhookEventId);
      if (!event || event.status !== WEBHOOK_STATUS.FAILED || event.attempts !== this.maxWebhookAttempts) {
        return;
      }
      this.logger.warn('billing_webhook_consumer.notify_attempt_limit_reached', {
        webhookEventId,
        attempts: event.attempts,
        lastError: event.lastError,
      });
      await this.webhookEventRepository.markWebhookEventAlerted(webhookEventId, '[ATTEMPT_LIMIT_ALERT]');
    } catch (err) {
      this.logger.error('billing_webhook_consumer.failed_to_notify_alert', {
        webhookEventId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private getRetryAttempt(msg: Message): number {
    const headers = msg.properties?.headers ?? {};
    const rawValue = headers['x-retry-attempt'];
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }
}

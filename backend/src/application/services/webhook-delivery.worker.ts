import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

import type { NoteEventPayload } from '../../domain/note-event.js';
import { WebhookSubscriptionRepository } from '../ports/webhooks/webhook-subscription.repository.js';
import { WebhookDeliveryService } from './webhook-delivery.service.js';
import { AppLogger } from '../../observability/logger.js';

const EXCHANGE_NAME = 'kb.webhook';
const QUEUE_NAME = 'kb.webhook.delivery';
const ROUTING_KEY = 'webhook.deliver';
const PREFETCH_COUNT = 5;
const MAX_RETRIES = 3;
const RECONNECT_DELAY_MS = 5_000;

/**
 * Worker that consumes webhook delivery jobs from RabbitMQ and
 * dispatches HTTP requests to all matching subscriptions.
 *
 * Follows the same lifecycle and reconnection pattern as the EmbeddingWorker.
 */
@Injectable()
export class WebhookDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null;
  private closed = false;

  constructor(
    private readonly subscriptionRepo: WebhookSubscriptionRepository,
    private readonly deliveryService: WebhookDeliveryService,
    private readonly logger: AppLogger,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async onModuleInit() {
    const url = this.getRabbitMqUrl();
    if (!url) {
      this.logger.info('webhook_worker.disabled_no_url');
      return;
    }

    try {
      await this.connect();
    } catch (error) {
      this.logger.error('webhook_worker.init_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async onModuleDestroy() {
    this.closed = true;
    try { await this.channel?.close(); } catch { /* ignore */ }
    try { await this.connection?.close(); } catch { /* ignore */ }
    this.channel = null;
    this.connection = null;
    this.logger.info('webhook_worker.stopped');
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  private async connect() {
    const url = this.getRabbitMqUrl();
    if (!url) return;

    const amqpModuleName = 'amqplib';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const amqplib: any = await import(amqpModuleName);
    const conn = await amqplib.connect(url);
    this.connection = conn;

    conn.on('error', (err: Error) => {
      this.logger.error('webhook_worker.connection_error', { error: err.message });
      this.channel = null;
    });
    conn.on('close', () => {
      this.channel = null;
      if (!this.closed) {
        this.logger.warn('webhook_worker.connection_closed_reconnecting');
        setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
      }
    });

    const ch = await conn.createChannel();
    await ch.prefetch(PREFETCH_COUNT);

    await ch.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await ch.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
    });
    await ch.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

    this.channel = ch;

    // Start consuming
    await ch.consume(QUEUE_NAME, (msg: any) => {
      if (!msg) return;
      void this.handleMessage(ch, msg);
    });

    this.logger.info('webhook_worker.started', {
      url: url.replace(/\/\/[^@]*@/, '//***@'),
      prefetch: PREFETCH_COUNT,
    });
  }

  private async reconnect() {
    if (this.closed) return;
    try {
      await this.connect();
    } catch (error) {
      this.logger.error('webhook_worker.reconnect_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
    }
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleMessage(ch: any, msg: any) {
    const startMs = Date.now();
    let payload: NoteEventPayload;

    try {
      payload = JSON.parse(msg.content.toString()) as NoteEventPayload;
    } catch {
      this.logger.error('webhook_worker.invalid_message', {
        content: msg.content.toString().slice(0, 200),
      });
      ch.nack(msg, false, false);
      return;
    }

    try {
      const subscriptions = await this.subscriptionRepo.findByEvent(
        payload.userId,
        payload.workspaceSlug,
        payload.event,
      );

      const results = await Promise.allSettled(
        subscriptions.map((sub) => this.deliveryService.deliver(sub, payload)),
      );

      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount > 0) {
        this.logger.warn('webhook_worker.partial_delivery_failure', {
          event: payload.event,
          total: subscriptions.length,
          failed: failedCount,
        });
      }

      ch.ack(msg);

      this.logger.info('webhook_worker.job_completed', {
        event: payload.event,
        subscriptions: subscriptions.length,
        durationMs: Date.now() - startMs,
      });
    } catch (error) {
      const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;

      this.logger.error('webhook_worker.job_failed', {
        event: payload.event,
        retryCount,
        error: error instanceof Error ? error.message : String(error),
      });

      if (retryCount >= MAX_RETRIES) {
        ch.nack(msg, false, false);
        this.logger.warn('webhook_worker.job_dead_lettered', {
          event: payload.event,
          retryCount,
        });
      } else {
        ch.ack(msg);
        ch.publish(
          EXCHANGE_NAME,
          ROUTING_KEY,
          Buffer.from(JSON.stringify(payload)),
          {
            persistent: true,
            contentType: 'application/json',
            headers: { 'x-retry-count': retryCount + 1 },
          },
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getRabbitMqUrl(): string {
    return String(process.env.KB_RABBITMQ_URL || '').trim();
  }
}

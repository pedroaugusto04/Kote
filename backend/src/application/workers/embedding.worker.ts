import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { type EmbeddingJobPayload } from '../ports/notes/embedding-queue.publisher.js';
import { EmbeddingJobProcessorService } from '../services/notes/embedding-job-processor.service.js';
import { AppLogger } from '../../observability/logger.js';

const EXCHANGE_NAME = 'kb.embedding';
const HIGH_PRIORITY_QUEUE = 'kb.embedding.high';
const LOW_PRIORITY_QUEUE = 'kb.embedding.low';
const HIGH_PRIORITY_ROUTING_KEY = 'embedding.high';
const LOW_PRIORITY_ROUTING_KEY = 'embedding.low';

/**
 * Max number of unacknowledged messages the worker will pull at once.
 */
const PREFETCH_COUNT = 5;

/**
 * Maximum number of times a message will be retried before being dead-lettered.
 */
const MAX_RETRIES = 3;

/**
 * Delay before attempting to reconnect after a connection loss.
 */
const RECONNECT_DELAY_MS = 5_000;

@Injectable()
export class EmbeddingWorker implements OnModuleInit, OnModuleDestroy {
  // Using 'any' for amqplib types — the package is loaded dynamically at
  // runtime and @types/amqplib may not be installed in all environments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null;
  private closed = false;

  constructor(
    private readonly processor: EmbeddingJobProcessorService,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async onModuleInit() {
    if (!this.shouldStart()) {
      this.logger.info('embedding_worker.disabled');
      return;
    }

    try {
      await this.connect();
    } catch (error) {
      this.logger.error('embedding_worker.init_failed', {
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
    this.logger.info('embedding_worker.stopped');
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  private async connect() {
    const url = this.getRabbitMqUrl();
    if (!url) {
      this.logger.warn('embedding_worker.no_rabbitmq_url');
      return;
    }

    const amqpModuleName = 'amqplib';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const amqplib: any = await import(amqpModuleName);
    const conn = await amqplib.connect(url);
    this.connection = conn;

    conn.on('error', (err: Error) => {
      this.logger.error('embedding_worker.connection_error', { error: err.message });
      this.channel = null;
    });
    conn.on('close', () => {
      this.channel = null;
      if (!this.closed) {
        this.logger.warn('embedding_worker.connection_closed_reconnecting');
        setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
      }
    });

    const ch = await conn.createChannel();
    await ch.prefetch(PREFETCH_COUNT);

    // Assert exchange + queues (idempotent — matches publisher assertions)
    await ch.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    
    // High priority queue
    await ch.assertQueue(HIGH_PRIORITY_QUEUE, {
      durable: true,
      arguments: { 'x-max-priority': 10, 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
    });
    await ch.bindQueue(HIGH_PRIORITY_QUEUE, EXCHANGE_NAME, HIGH_PRIORITY_ROUTING_KEY);
    
    // Low priority queue
    await ch.assertQueue(LOW_PRIORITY_QUEUE, {
      durable: true,
      arguments: { 'x-max-priority': 5, 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
    });
    await ch.bindQueue(LOW_PRIORITY_QUEUE, EXCHANGE_NAME, LOW_PRIORITY_ROUTING_KEY);

    this.channel = ch;

    // Start consuming from both queues
    await ch.consume(HIGH_PRIORITY_QUEUE, (msg: any) => {
      if (!msg) return;
      void this.handleMessage(ch, msg);
    });
    await ch.consume(LOW_PRIORITY_QUEUE, (msg: any) => {
      if (!msg) return;
      void this.handleMessage(ch, msg);
    });

    this.logger.info('embedding_worker.started', {
      url: url.replace(/\/\/[^@]*@/, '//***@'),
      prefetch: PREFETCH_COUNT,
    });
  }

  private async reconnect() {
    if (this.closed) return;
    try {
      await this.connect();
    } catch (error) {
      this.logger.error('embedding_worker.reconnect_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Retry again after delay
      setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
    }
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleMessage(ch: any, msg: any) {
    const startMs = Date.now();
    let job: EmbeddingJobPayload;

    try {
      job = JSON.parse(msg.content.toString()) as EmbeddingJobPayload;
    } catch {
      this.logger.error('embedding_worker.invalid_message', {
        content: msg.content.toString().slice(0, 200),
      });
      ch.nack(msg, false, false); // don't requeue malformed messages
      return;
    }

    try {
      await this.processor.processJob(ch, job);

      ch.ack(msg);

      this.logger.info('embedding_worker.job_completed', {
        type: job.type,
        durationMs: Date.now() - startMs,
      });
    } catch (error) {
      const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;

      this.logger.error('embedding_worker.job_failed', {
        type: job.type,
        retryCount,
        error: error instanceof Error ? error.message : String(error),
      });

      if (retryCount >= MAX_RETRIES) {
        // Dead-letter after max retries
        ch.nack(msg, false, false);
        this.logger.warn('embedding_worker.job_dead_lettered', {
          type: job.type,
          retryCount,
        });
      } else {
        // Republish with incremented retry count (manual retry approach)
        ch.ack(msg);
        const routingKey = job.priority === 'high' ? HIGH_PRIORITY_ROUTING_KEY : LOW_PRIORITY_ROUTING_KEY;
        ch.publish(
          EXCHANGE_NAME,
          routingKey,
          Buffer.from(JSON.stringify(job)),
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

  private shouldStart(): boolean {
    const env = this.runtimeEnv.read();
    if (env.disableEmbeddingWorker) return false;
    if (!env.embeddingAiApiKey) return false;
    return Boolean(this.getRabbitMqUrl());
  }

  private getRabbitMqUrl(): string {
    return String(process.env.KB_RABBITMQ_URL || '').trim();
  }
}


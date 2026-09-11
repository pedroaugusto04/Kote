import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { EmbeddingJobType, type EmbeddingJobPayload } from '../ports/notes/embedding-queue.publisher.js';
import { EmbeddingJobProcessorService } from '../services/notes/embedding-job-processor.service.js';
import { AppLogger } from '../../observability/logger.js';

const EXCHANGE_NAME = 'kb.embedding';
const LOW_PRIORITY_QUEUE = 'kb.embedding.low';
const LOW_PRIORITY_ROUTING_KEY = 'embedding.low';

/**
 * Max number of unacknowledged messages the low priority worker will pull at once.
 */
const PREFETCH_COUNT = 4;

/**
 * Maximum number of times a message will be retried before being dead-lettered.
 */
const MAX_RETRIES = 3;

/**
 * Delay before attempting to reconnect after a connection loss.
 */
const RECONNECT_DELAY_MS = 5_000;

@Injectable()
export class LowPriorityEmbeddingWorker implements OnModuleInit, OnModuleDestroy {
  private connection: any = null;
  private channel: any = null;
  private closed = false;

  constructor(
    private readonly processor: EmbeddingJobProcessorService,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit() {
    if (!this.shouldStart()) {
      this.logger.info('low_priority_embedding_worker.disabled');
      return;
    }

    await this.connect();
  }

  async onModuleDestroy() {
    this.closed = true;
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }

  private shouldStart(): boolean {
    const env = this.runtimeEnv.read();
    if (env.disableEmbeddingWorker) return false;
    if (!env.embeddingAiApiKey) return false;
    return Boolean(this.getRabbitMqUrl());
  }

  private getRabbitMqUrl(): string {
    return String(process.env.KB_RABBITMQ_URL || '').trim();
  }

  private async connect() {
    const url = this.getRabbitMqUrl();
    if (!url) {
      this.logger.warn('low_priority_embedding_worker.no_url');
      return;
    }

    const amqplib = await import('amqplib');
    const conn = await amqplib.connect(url);

    conn.on('error', (error: any) => {
      this.logger.error('low_priority_embedding_worker.connection_error', {
        error: error.message,
      });
    });

    conn.on('close', () => {
      this.channel = null;
      if (!this.closed) {
        this.logger.warn('low_priority_embedding_worker.connection_closed_reconnecting');
        setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
      }
    });

    const ch = await conn.createChannel();
    await ch.prefetch(PREFETCH_COUNT);

    // Assert exchange + low priority queue
    await ch.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await ch.assertQueue(LOW_PRIORITY_QUEUE, {
      durable: true,
      arguments: { 'x-max-priority': 5, 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
    });
    await ch.bindQueue(LOW_PRIORITY_QUEUE, EXCHANGE_NAME, LOW_PRIORITY_ROUTING_KEY);

    this.channel = ch;

    // Start consuming only low priority queue
    await ch.consume(LOW_PRIORITY_QUEUE, (msg: any) => {
      if (!msg) return;
      void this.handleMessage(ch, msg);
    });

    this.logger.info('low_priority_embedding_worker.started', {
      url: url.replace(/\/\/[^@]*@/, '//***@'),
      prefetch: PREFETCH_COUNT,
    });
  }

  private async reconnect() {
    if (this.closed) return;
    try {
      await this.connect();
    } catch (error) {
      this.logger.error('low_priority_embedding_worker.reconnect_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
    }
  }

  private async handleMessage(ch: any, msg: any) {
    const startMs = Date.now();
    const job = JSON.parse(msg.content.toString()) as EmbeddingJobPayload;

    try {
      switch (job.type) {
        case EmbeddingJobType.Index:
          await this.processor.processIndex(job.userId, job.noteId);
          break;
        case EmbeddingJobType.Delete:
          await this.processor.processDelete(job.userId, job.noteId);
          break;
        case EmbeddingJobType.ReindexAll:
          await this.processor.processReindexAll(job.userId);
          break;
        default:
          this.logger.warn('low_priority_embedding_worker.unexpected_job_type', { job });
          ch.ack(msg);
      }

      ch.ack(msg);

      this.logger.info('low_priority_embedding_worker.job_completed', {
        type: job.type,
        durationMs: Date.now() - startMs,
      });
    } catch (error) {
      this.logger.error('low_priority_embedding_worker.job_failed', {
        type: job.type,
        error: error instanceof Error ? error.message : String(error),
      });

      const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;
      if (retryCount >= MAX_RETRIES) {
        ch.nack(msg, false, false);
        this.logger.warn('low_priority_embedding_worker.job_dead_lettered', {
          type: job.type,
          retryCount,
        });
      } else {
        ch.ack(msg);
        ch.publish(
          EXCHANGE_NAME,
          LOW_PRIORITY_ROUTING_KEY,
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
}


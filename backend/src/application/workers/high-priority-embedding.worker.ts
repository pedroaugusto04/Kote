import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

import { EmbeddingGateway } from '../ports/notes/embedding.gateway.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { EmbeddingJobType, type EmbeddingJobPayload } from '../ports/notes/embedding-queue.publisher.js';
import { AppLogger } from '../../observability/logger.js';

const EXCHANGE_NAME = 'kb.embedding';
const HIGH_PRIORITY_QUEUE = 'kb.embedding.high';
const HIGH_PRIORITY_ROUTING_KEY = 'embedding.high';

/**
 * Max number of unacknowledged messages the high priority worker will pull at once.
 * Lower prefetch ensures faster response times for user-facing operations.
 */
const PREFETCH_COUNT = 2;

/**
 * Delay before attempting to reconnect after a connection loss.
 */
const RECONNECT_DELAY_MS = 5_000;

@Injectable()
export class HighPriorityEmbeddingWorker implements OnModuleInit, OnModuleDestroy {
  private connection: any = null;
  private channel: any = null;
  private closed = false;

  constructor(
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit() {
    if (!this.shouldStart()) {
      this.logger.info('high_priority_embedding_worker.disabled');
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

  private getRabbitMqUrl(): string | undefined {
    return String(process.env.KB_RABBITMQ_URL || '').trim();
  }

  private async connect() {
    const url = this.getRabbitMqUrl();
    if (!url) {
      this.logger.warn('high_priority_embedding_worker.no_url');
      return;
    }

    const amqplib = await import('amqplib');
    const conn = await amqplib.connect(url);

    conn.on('error', (error: any) => {
      this.logger.error('high_priority_embedding_worker.connection_error', {
        error: error.message,
      });
    });

    conn.on('close', () => {
      this.channel = null;
      if (!this.closed) {
        this.logger.warn('high_priority_embedding_worker.connection_closed_reconnecting');
        setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
      }
    });

    const ch = await conn.createChannel();
    await ch.prefetch(PREFETCH_COUNT);

    // Assert exchange + high priority queue
    await ch.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await ch.assertQueue(HIGH_PRIORITY_QUEUE, {
      durable: true,
      arguments: { 'x-max-priority': 10, 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
    });
    await ch.bindQueue(HIGH_PRIORITY_QUEUE, EXCHANGE_NAME, HIGH_PRIORITY_ROUTING_KEY);

    this.channel = ch;

    // Start consuming only high priority queue
    await ch.consume(HIGH_PRIORITY_QUEUE, (msg: any) => {
      if (!msg) return;
      void this.handleMessage(ch, msg);
    });

    this.logger.info('high_priority_embedding_worker.started', {
      url: url.replace(/\/\/[^@]*@/, '//***@'),
      prefetch: PREFETCH_COUNT,
    });
  }

  private async reconnect() {
    if (this.closed) return;
    try {
      await this.connect();
    } catch (error) {
      this.logger.error('high_priority_embedding_worker.reconnect_failed', {
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
        case EmbeddingJobType.QueryEmbedding:
          await this.processQueryEmbedding(ch, job as EmbeddingJobPayload & { type: EmbeddingJobType.QueryEmbedding; queryText: string; replyTo?: string; correlationId?: string });
          break;
        default:
          this.logger.warn('high_priority_embedding_worker.unexpected_job_type', { job });
          ch.ack(msg);
      }

      ch.ack(msg);

      this.logger.info('high_priority_embedding_worker.job_completed', {
        type: job.type,
        durationMs: Date.now() - startMs,
      });
    } catch (error) {
      this.logger.error('high_priority_embedding_worker.job_failed', {
        type: job.type,
        error: error instanceof Error ? error.message : String(error),
      });

      const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;
      if (retryCount >= 3) {
        ch.nack(msg, false, false);
        this.logger.warn('high_priority_embedding_worker.job_dead_lettered', {
          type: job.type,
          retryCount,
        });
      } else {
        ch.ack(msg);
        ch.publish(
          EXCHANGE_NAME,
          HIGH_PRIORITY_ROUTING_KEY,
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

  private async processQueryEmbedding(ch: any, job: EmbeddingJobPayload & { type: EmbeddingJobType.QueryEmbedding; queryText: string; replyTo?: string; correlationId?: string }) {
    const env = this.runtimeEnv.read();
    const embeddingConfig = {
      provider: env.embeddingAiProvider,
      baseUrl: env.embeddingAiBaseUrl,
      model: env.embeddingAiModel,
      apiKey: env.embeddingAiApiKey,
    };

    try {
      const embeddings = await this.embeddingGateway.generateEmbeddings(
        embeddingConfig,
        [job.queryText],
      );

      if (job.replyTo) {
        await ch.sendToQueue(job.replyTo, Buffer.from(JSON.stringify({
          embeddings,
          correlationId: job.correlationId,
        })));
      }
    } catch (error) {
      this.logger.error('high_priority_embedding_worker.query_embedding_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (job.replyTo) {
        await ch.sendToQueue(job.replyTo, Buffer.from(JSON.stringify({
          embeddings: [],
          correlationId: job.correlationId,
          error: error instanceof Error ? error.message : String(error),
        })));
      }
    }
  }
}

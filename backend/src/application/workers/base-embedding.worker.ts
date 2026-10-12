import { type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import type { ChannelModel, Channel, ConsumeMessage } from 'amqplib';

import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { type EmbeddingJobPayload } from '../ports/notes/embedding-queue.publisher.js';
import { EmbeddingJobProcessorService } from '../services/notes/embedding-job-processor.service.js';
import { AppLogger } from '../../observability/logger.js';

export const EMBEDDING_EXCHANGE_NAME = 'kb.embedding';
const RECONNECT_DELAY_MS = 5_000;
const DEFAULT_MAX_RETRIES = 3;

export abstract class BaseEmbeddingWorker implements OnModuleInit, OnModuleDestroy {
  protected connection: ChannelModel | null = null;
  protected channel: Channel | null = null;
  protected closed = false;

  protected abstract readonly queueName: string;
  protected abstract readonly routingKey: string;
  protected abstract readonly prefetchCount: number;
  protected abstract readonly maxPriority: number;
  protected abstract readonly workerName: string;
  protected readonly maxRetries: number = DEFAULT_MAX_RETRIES;

  constructor(
    protected readonly processor: EmbeddingJobProcessorService,
    protected readonly runtimeEnv: RuntimeEnvironmentProvider,
    protected readonly logger: AppLogger,
  ) {}

  async onModuleInit() {
    if (!this.shouldStart()) {
      this.logger.info(`${this.workerName}.disabled`);
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

  protected shouldStart(): boolean {
    const env = this.runtimeEnv.read();
    if (env.disableEmbeddingWorker) return false;
    if (!env.embeddingAiApiKey) return false;
    return Boolean(this.getRabbitMqUrl());
  }

  protected getRabbitMqUrl(): string | undefined {
    return String(process.env.KB_RABBITMQ_URL || '').trim();
  }

  protected async connect() {
    const url = this.getRabbitMqUrl();
    if (!url) {
      this.logger.warn(`${this.workerName}.no_url`);
      return;
    }

    const amqplib = await import('amqplib');
    const conn = await amqplib.connect(url);

    conn.on('error', (error: Error) => {
      this.logger.error(`${this.workerName}.connection_error`, {
        error: error.message,
      });
    });

    conn.on('close', () => {
      this.channel = null;
      if (!this.closed) {
        this.logger.warn(`${this.workerName}.connection_closed_reconnecting`);
        setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
      }
    });

    const ch = await conn.createChannel();
    await ch.prefetch(this.prefetchCount);

    await ch.assertExchange(EMBEDDING_EXCHANGE_NAME, 'direct', { durable: true });
    await ch.assertQueue(this.queueName, {
      durable: true,
      arguments: { 'x-max-priority': this.maxPriority, 'x-dead-letter-exchange': `${EMBEDDING_EXCHANGE_NAME}.dlx` },
    });
    await ch.bindQueue(this.queueName, EMBEDDING_EXCHANGE_NAME, this.routingKey);

    this.channel = ch;

    await ch.consume(this.queueName, (msg: ConsumeMessage | null) => {
      if (!msg) return;
      void this.handleMessage(ch, msg);
    });

    this.logger.info(`${this.workerName}.started`, {
      url: url.replace(/\/\/[^@]*@/, '//***@'),
      prefetch: this.prefetchCount,
    });
  }

  protected async reconnect() {
    if (this.closed) return;
    try {
      await this.connect();
    } catch (error) {
      this.logger.error(`${this.workerName}.reconnect_failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
    }
  }

  protected abstract processJob(ch: Channel, job: EmbeddingJobPayload): Promise<void>;

  private async handleMessage(ch: Channel, msg: ConsumeMessage) {
    const startMs = Date.now();
    const job = JSON.parse(msg.content.toString()) as EmbeddingJobPayload;

    try {
      await this.processJob(ch, job);
      ch.ack(msg);

      this.logger.info(`${this.workerName}.job_completed`, {
        type: job.type,
        durationMs: Date.now() - startMs,
      });
    } catch (error) {
      this.logger.error(`${this.workerName}.job_failed`, {
        type: job.type,
        error: error instanceof Error ? error.message : String(error),
      });

      const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;
      if (retryCount >= this.maxRetries) {
        ch.nack(msg, false, false);
        this.logger.warn(`${this.workerName}.job_dead_lettered`, {
          type: job.type,
          retryCount,
        });
      } else {
        ch.ack(msg);
        ch.publish(
          EMBEDDING_EXCHANGE_NAME,
          this.routingKey,
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

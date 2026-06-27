import { OnModuleDestroy } from '@nestjs/common';
import amqplib, { type ChannelModel, type Channel } from 'amqplib';
import { AppLogger } from '../../observability/logger.js';

const RECONNECT_DELAY_MS = 5_000;

export abstract class BaseRabbitMqPublisher implements OnModuleDestroy {
  protected connection: ChannelModel | null = null;
  protected channel: Channel | null = null;
  protected connecting = false;
  protected closed = false;

  constructor(protected readonly logger: AppLogger) {}

  async onModuleDestroy() {
    this.closed = true;
    try {
      if (this.channel) await this.channel.close();
    } catch {
      // already closed
    }
    try {
      if (this.connection) await this.connection.close();
    } catch {
      // already closed
    }
    this.channel = null;
    this.connection = null;
  }

  protected getUrl(): string {
    return String(process.env.KB_RABBITMQ_URL || '').trim();
  }

  protected async ensureChannel(url: string): Promise<Channel> {
    if (this.channel) return this.channel;
    if (this.connecting) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (this.channel) return this.channel;
      throw new Error('rabbitmq.connection_in_progress');
    }

    this.connecting = true;
    try {
      const conn = await amqplib.connect(url);
      this.connection = conn;

      conn.on('error', (error: Error) => {
        this.logger.error('rabbitmq.connection_error', { error: error.message });
        this.channel = null;
      });
      conn.on('close', () => {
        this.channel = null;
        if (!this.closed) {
          this.logger.warn('rabbitmq.connection_closed_reconnecting');
          setTimeout(() => this.reconnect(url), RECONNECT_DELAY_MS);
        }
      });

      const ch = await conn.createChannel();
      await this.setupChannel(ch);

      this.channel = ch;
      this.logger.info('rabbitmq.connected');
      return ch;
    } finally {
      this.connecting = false;
    }
  }

  protected abstract setupChannel(channel: Channel): Promise<void>;

  protected reconnect(url: string) {
    if (this.closed) return;
    void this.ensureChannel(url).catch((error: unknown) => {
      this.logger.error('rabbitmq.reconnect_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { AppLogger } from '../../../observability/logger.js';

type SubscriptionStatusMessageHandler = (userId: string, payload: unknown) => void;

@Injectable()
export class BillingSseRedisBroker implements OnModuleDestroy {
  private readonly redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  private readonly enabled = process.env.BILLING_SSE_REDIS_ENABLED !== 'false' && process.env.NODE_ENV !== 'test';
  private readonly channelPrefix = process.env.BILLING_SSE_REDIS_CHANNEL_PREFIX || 'billing:sse:subscription_status:';
  private readonly channelPattern = `${this.channelPrefix}*`;

  private readonly publisher: RedisClientType | null;
  private readonly subscriber: RedisClientType | null;

  private publisherConnectPromise: Promise<boolean> | null = null;
  private subscriberConnectPromise: Promise<boolean> | null = null;
  private listenerSetupPromise: Promise<boolean> | null = null;

  private listenerHandler: SubscriptionStatusMessageHandler | null = null;
  private listenerReady = false;

  constructor(private readonly logger: AppLogger) {
    if (!this.enabled) {
      this.publisher = null;
      this.subscriber = null;
      return;
    }

    this.publisher = createClient({ url: this.redisUrl });
    this.subscriber = createClient({ url: this.redisUrl });

    this.publisher.on('error', (error) => {
      this.logger.warn(`Billing SSE Redis publisher error: ${error?.message ?? String(error)}`);
    });

    this.subscriber.on('error', (error) => {
      this.logger.warn(`Billing SSE Redis subscriber error: ${error?.message ?? String(error)}`);
    });
  }

  async onModuleDestroy() {
    if (this.publisher) {
      try {
        await this.publisher.quit();
      } catch (err) {
        this.logger.warn(`Failed to close Redis publisher: ${err}`);
      }
    }
    if (this.subscriber) {
      try {
        await this.subscriber.quit();
      } catch (err) {
        this.logger.warn(`Failed to close Redis subscriber: ${err}`);
      }
    }
  }

  private toChannel(userId: string) {
    return `${this.channelPrefix}${userId}`;
  }

  private userIdFromChannel(channel: string): string | null {
    if (!channel.startsWith(this.channelPrefix)) return null;
    const userId = channel.slice(this.channelPrefix.length);
    return userId || null;
  }

  private async ensurePublisherConnected(): Promise<boolean> {
    const publisher = this.publisher;
    if (!publisher || !this.enabled) return false;
    if (publisher.isOpen) return true;
    if (this.publisherConnectPromise) return this.publisherConnectPromise;

    this.publisherConnectPromise = (async () => {
      try {
        await publisher.connect();
        this.logger.info(`Billing SSE Redis publisher connected to ${this.redisUrl}`);
        return true;
      } catch (error) {
        this.logger.warn(`Failed to connect Redis publisher for SSE: ${error}`);
        return false;
      } finally {
        this.publisherConnectPromise = null;
      }
    })();

    return this.publisherConnectPromise;
  }

  private async ensureSubscriberConnected(): Promise<boolean> {
    const subscriber = this.subscriber;
    if (!subscriber || !this.enabled) return false;
    if (subscriber.isOpen) return true;
    if (this.subscriberConnectPromise) return this.subscriberConnectPromise;

    this.subscriberConnectPromise = (async () => {
      try {
        await subscriber.connect();
        this.logger.info(`Billing SSE Redis subscriber connected to ${this.redisUrl}`);
        return true;
      } catch (error) {
        this.logger.warn(`Failed to connect Redis subscriber for SSE: ${error}`);
        return false;
      } finally {
        this.subscriberConnectPromise = null;
      }
    })();

    return this.subscriberConnectPromise;
  }

  public async ensureSubscriptionStatusListener(handler: SubscriptionStatusMessageHandler): Promise<boolean> {
    if (!this.enabled || !this.subscriber) return false;
    this.listenerHandler = handler;

    if (this.listenerReady) return true;
    if (this.listenerSetupPromise) return this.listenerSetupPromise;

    this.listenerSetupPromise = (async () => {
      try {
        const connected = await this.ensureSubscriberConnected();
        if (!connected || !this.subscriber) return false;

        try {
          await this.subscriber.pSubscribe(this.channelPattern, (message: string, channel: string) => {
            const userId = this.userIdFromChannel(channel);
            if (!userId || !this.listenerHandler) return;

            try {
              const payload = JSON.parse(message);
              this.listenerHandler(userId, payload);
            } catch (error) {
              this.logger.warn(`Invalid SSE Redis payload on channel ${channel}: ${error}`);
            }
          });

          this.listenerReady = true;
          this.logger.info(`Billing SSE Redis listener active on ${this.channelPattern}`);
          return true;
        } catch (error) {
          this.logger.warn(`Failed to register SSE Redis listener: ${error}`);
          return false;
        }
      } finally {
        this.listenerSetupPromise = null;
      }
    })();

    return this.listenerSetupPromise;
  }

  public async publishSubscriptionStatus(userId: string, payload: unknown): Promise<boolean> {
    if (!userId || !this.enabled || !this.publisher) return false;

    const connected = await this.ensurePublisherConnected();
    if (!connected || !this.publisher) return false;

    try {
      await this.publisher.publish(this.toChannel(userId), JSON.stringify(payload ?? null));
      return true;
    } catch (error) {
      this.logger.warn(`Failed to publish SSE to Redis for userId=${userId}: ${error}`);
      return false;
    }
  }
}

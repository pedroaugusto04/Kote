import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { type Channel } from 'amqplib';

import { EmailQueuePublisher } from '../../application/ports/email/email-queue.publisher.js';
import type { EmailSendPayload } from '../../application/models/email.models.js';
import { AppLogger } from '../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../../application/ports/observability/runtime-environment.port.js';
import { BaseRabbitMqPublisher } from './base-rabbitmq.publisher.js';

@Injectable()
export class RabbitMqEmailQueuePublisher extends BaseRabbitMqPublisher implements EmailQueuePublisher {
  private exchange: string;
  private routingKey: string;

  constructor(
    logger: AppLogger,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {
    super(logger);
    const env = this.environmentProvider.read();
    this.exchange = env.emailQueueExchange;
    this.routingKey = env.emailQueueRoutingKey;
  }

  async publishEmailMessage(payload: EmailSendPayload): Promise<void> {
    const url = this.getUrl();
    if (!url) {
      throw new InternalServerErrorException('KB_RABBITMQ_URL is not configured');
    }

    const channel = await this.ensureChannel(url);
    const body = Buffer.from(JSON.stringify(payload));

    channel.publish(this.exchange, this.routingKey, body, {
      persistent: true,
      contentType: 'application/json',
    });
  }

  protected async setupChannel(channel: Channel): Promise<void> {
    await channel.assertExchange(this.exchange, 'direct', { durable: true });
  }
}
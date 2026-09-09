import { Injectable, OnModuleDestroy } from '@nestjs/common';
import amqplib from 'amqplib';
import { AiSessionSynthesisQueuePublisher, type AiSessionSynthesisQueuePayload } from '../../application/ports/notes/ai-session-synthesis-queue.publisher.js';
import { AppLogger } from '../../observability/logger.js';
import { AI_SESSION_SYNTHESIS_QUEUE } from '../../application/constants/ai-session-synthesis.constants.js';

@Injectable()
export class RabbitMqAiSessionSynthesisQueuePublisher implements AiSessionSynthesisQueuePublisher, OnModuleDestroy {
  private connection: any = null;
  private channel: any = null;

  constructor(private readonly logger: AppLogger) {}

  async publish(job: AiSessionSynthesisQueuePayload): Promise<void> {
    const url = String(process.env.KB_RABBITMQ_URL || '').trim();
    if (!url) throw new Error('rabbitmq_not_configured');
    const channel = await this.ensureChannel(url);
    await new Promise<void>((resolve, reject) => {
      channel.publish(AI_SESSION_SYNTHESIS_QUEUE.exchange, AI_SESSION_SYNTHESIS_QUEUE.routingKey, Buffer.from(JSON.stringify(job)), { persistent: true, contentType: 'application/json' }, (error: Error | null) => error ? reject(error) : resolve());
    });
  }

  private async ensureChannel(url: string) {
    if (this.channel) return this.channel;
    this.connection = await amqplib.connect(url);
    this.connection.on('close', () => { this.channel = null; this.connection = null; });
    const channel = await this.connection.createConfirmChannel();
    await channel.assertExchange(AI_SESSION_SYNTHESIS_QUEUE.exchange, 'direct', { durable: true });
    await channel.assertQueue(AI_SESSION_SYNTHESIS_QUEUE.queue, { durable: true, arguments: { 'x-dead-letter-exchange': AI_SESSION_SYNTHESIS_QUEUE.deadLetterExchange } });
    await channel.bindQueue(AI_SESSION_SYNTHESIS_QUEUE.queue, AI_SESSION_SYNTHESIS_QUEUE.exchange, AI_SESSION_SYNTHESIS_QUEUE.routingKey);
    await channel.assertExchange(AI_SESSION_SYNTHESIS_QUEUE.deadLetterExchange, 'direct', { durable: true });
    await channel.assertQueue(AI_SESSION_SYNTHESIS_QUEUE.deadLetterQueue, { durable: true });
    await channel.bindQueue(AI_SESSION_SYNTHESIS_QUEUE.deadLetterQueue, AI_SESSION_SYNTHESIS_QUEUE.deadLetterExchange, AI_SESSION_SYNTHESIS_QUEUE.routingKey);
    this.channel = channel;
    return channel;
  }

  async onModuleDestroy() {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}

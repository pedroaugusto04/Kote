import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EmbeddingQueuePublisher } from '../../application/ports/notes/embedding-queue.publisher.js';
import { WebhookQueuePublisher } from '../../application/ports/webhooks/webhook-queue.publisher.js';
import { RabbitMqEmbeddingQueuePublisher } from '../queue/rabbitmq-embedding-queue.publisher.js';
import { RabbitMqWebhookQueuePublisher } from '../queue/rabbitmq-webhook-queue.publisher.js';

@Module({
  imports: [LoggerModule],
  providers: [
    RabbitMqEmbeddingQueuePublisher,
    RabbitMqWebhookQueuePublisher,
    { provide: EmbeddingQueuePublisher, useExisting: RabbitMqEmbeddingQueuePublisher },
    { provide: WebhookQueuePublisher, useExisting: RabbitMqWebhookQueuePublisher },
  ],
  exports: [
    EmbeddingQueuePublisher,
    WebhookQueuePublisher,
  ],
})
export class QueueModule {}

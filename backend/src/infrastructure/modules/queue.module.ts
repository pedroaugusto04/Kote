import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { DatabaseModule } from './database.module.js';
import { EmbeddingQueuePublisher } from '../../application/ports/notes/embedding-queue.publisher.js';
import { WebhookQueuePublisher } from '../../application/ports/webhooks/webhook-queue.publisher.js';
import { RabbitMqEmbeddingQueuePublisher } from '../queue/rabbitmq-embedding-queue.publisher.js';
import { RabbitMqWebhookQueuePublisher } from '../queue/rabbitmq-webhook-queue.publisher.js';
import { AiSessionSynthesisQueuePublisher } from '../../application/ports/notes/ai-session-synthesis-queue.publisher.js';
import { RabbitMqAiSessionSynthesisQueuePublisher } from '../queue/rabbitmq-ai-session-synthesis-queue.publisher.js';

@Module({
  imports: [LoggerModule, DatabaseModule],
  providers: [
    RabbitMqEmbeddingQueuePublisher,
    RabbitMqWebhookQueuePublisher,
    RabbitMqAiSessionSynthesisQueuePublisher,
    { provide: EmbeddingQueuePublisher, useExisting: RabbitMqEmbeddingQueuePublisher },
    { provide: WebhookQueuePublisher, useExisting: RabbitMqWebhookQueuePublisher },
    { provide: AiSessionSynthesisQueuePublisher, useExisting: RabbitMqAiSessionSynthesisQueuePublisher },
  ],
  exports: [
    EmbeddingQueuePublisher,
    WebhookQueuePublisher,
    AiSessionSynthesisQueuePublisher,
  ],
})
export class QueueModule {}

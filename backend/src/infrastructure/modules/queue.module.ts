import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { DatabaseModule } from './database.module.js';
import { EmbeddingQueuePublisher } from '../../application/ports/notes/embedding-queue.publisher.js';
import { WebhookQueuePublisher } from '../../application/ports/webhooks/webhook-queue.publisher.js';
import { RabbitMqEmbeddingQueuePublisher } from '../queue/rabbitmq-embedding-queue.publisher.js';
import { RabbitMqWebhookQueuePublisher } from '../queue/rabbitmq-webhook-queue.publisher.js';
import { PostgresSettingsRepository } from '../repositories/settings.repository.js';
import { SettingsRepository } from '../../application/ports/settings.repository.js';
import { AiSessionSynthesisQueuePublisher } from '../../application/ports/notes/ai-session-synthesis-queue.publisher.js';
import { RabbitMqAiSessionSynthesisQueuePublisher } from '../queue/rabbitmq-ai-session-synthesis-queue.publisher.js';

@Module({
  imports: [LoggerModule, DatabaseModule],
  providers: [
    RabbitMqEmbeddingQueuePublisher,
    RabbitMqWebhookQueuePublisher,
    RabbitMqAiSessionSynthesisQueuePublisher,
    PostgresSettingsRepository,
    { provide: EmbeddingQueuePublisher, useExisting: RabbitMqEmbeddingQueuePublisher },
    { provide: WebhookQueuePublisher, useExisting: RabbitMqWebhookQueuePublisher },
    { provide: AiSessionSynthesisQueuePublisher, useExisting: RabbitMqAiSessionSynthesisQueuePublisher },
    { provide: SettingsRepository, useExisting: PostgresSettingsRepository },
  ],
  exports: [
    EmbeddingQueuePublisher,
    WebhookQueuePublisher,
    AiSessionSynthesisQueuePublisher,
    SettingsRepository,
  ],
})
export class QueueModule {}

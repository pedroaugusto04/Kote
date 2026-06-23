import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { DatabaseModule } from './database.module.js';
import { EmbeddingQueuePublisher } from '../../application/ports/notes/embedding-queue.publisher.js';
import { WebhookQueuePublisher } from '../../application/ports/webhooks/webhook-queue.publisher.js';
import { RabbitMqEmbeddingQueuePublisher } from '../queue/rabbitmq-embedding-queue.publisher.js';
import { RabbitMqWebhookQueuePublisher } from '../queue/rabbitmq-webhook-queue.publisher.js';
import { PostgresSettingsRepository } from '../repositories/settings.repository.js';
import { SettingsRepository } from '../../application/ports/settings.repository.js';

@Module({
  imports: [LoggerModule, DatabaseModule],
  providers: [
    RabbitMqEmbeddingQueuePublisher,
    RabbitMqWebhookQueuePublisher,
    PostgresSettingsRepository,
    { provide: EmbeddingQueuePublisher, useExisting: RabbitMqEmbeddingQueuePublisher },
    { provide: WebhookQueuePublisher, useExisting: RabbitMqWebhookQueuePublisher },
    { provide: SettingsRepository, useExisting: PostgresSettingsRepository },
  ],
  exports: [
    EmbeddingQueuePublisher,
    WebhookQueuePublisher,
    SettingsRepository,
  ],
})
export class QueueModule {}

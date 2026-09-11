import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';
import { EmailModule } from './email.module.js';
import { AiModule } from './ai.module.js';
import { IntegrationsModule } from './integrations.module.js';

import { WeeklySummaryService } from '../../application/services/content/weekly-summary.service.js';
import { WeeklySummaryWorker } from '../../application/workers/weekly-summary.worker.js';
import { WeeklySummaryQueuePublisher } from '../../application/ports/weekly-summary/weekly-summary-queue.publisher.js';
import { WeeklySummaryRepository } from '../../application/ports/weekly-summary/weekly-summary.repository.js';
import { PostgresWeeklySummaryRepository } from '../repositories/weekly-summary.repository.js';
import { RabbitMqWeeklySummaryQueuePublisher } from '../queue/rabbitmq-weekly-summary-queue.publisher.js';
import { RabbitMqWeeklySummaryQueueConsumer } from '../queue/rabbitmq-weekly-summary-queue.consumer.js';

@Module({
  imports: [
    LoggerModule,
    EnvModule,
    DatabaseModule,
    EmailModule,
    AiModule,
    IntegrationsModule,
  ],
  providers: [
    WeeklySummaryService,
    WeeklySummaryWorker,
    PostgresWeeklySummaryRepository,
    { provide: WeeklySummaryRepository, useExisting: PostgresWeeklySummaryRepository },
    RabbitMqWeeklySummaryQueuePublisher,
    RabbitMqWeeklySummaryQueueConsumer,
    { provide: WeeklySummaryQueuePublisher, useExisting: RabbitMqWeeklySummaryQueuePublisher },
  ],
  exports: [
    WeeklySummaryService,
    WeeklySummaryWorker,
    WeeklySummaryRepository,
  ],
})
export class WeeklySummaryModule {}

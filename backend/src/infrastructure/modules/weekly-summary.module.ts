import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';
import { EmailModule } from './email.module.js';
import { AiModule } from './ai.module.js';
import { IntegrationsModule } from './integrations.module.js';

import { WeeklySummaryService } from '../../application/services/weekly-summary.service.js';
import { WeeklySummaryWorker } from '../../application/services/workers/weekly-summary.worker.js';
import { WeeklySummaryQueuePublisher } from '../../application/ports/weekly-summary/weekly-summary-queue.publisher.js';
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
    RabbitMqWeeklySummaryQueuePublisher,
    RabbitMqWeeklySummaryQueueConsumer,
    { provide: WeeklySummaryQueuePublisher, useExisting: RabbitMqWeeklySummaryQueuePublisher },
  ],
  exports: [
    WeeklySummaryService,
    WeeklySummaryWorker,
  ],
})
export class WeeklySummaryModule {}

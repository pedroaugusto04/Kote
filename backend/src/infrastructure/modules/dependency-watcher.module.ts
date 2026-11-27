import { Module } from '@nestjs/common';

import { DependencyWatcherService } from '../../application/services/dependency-watcher/dependency-watcher.service.js';
import { DependencyAlertNotificationService } from '../../application/services/dependency-watcher/dependency-alert-notification.service.js';
import { DependencyWatcherWorker } from '../../application/workers/dependency-watcher.worker.js';
import { DependencyImportWorker } from '../../application/workers/dependency-import.worker.js';
import { DefaultDependencyAlertGateway } from '../ai/dependency-alert.gateway.js';
import { DependencyAlertGateway } from '../../application/ports/dependency-watcher/dependency-alert.port.js';
import { RegistryStrategyProvider } from '../../application/ports/dependency-registry/registry-strategy.provider.js';
import { DependencyCheckQueuePublisher } from '../../application/ports/dependency-watcher/dependency-check-queue.publisher.js';
import { DependencyImportQueuePublisher } from '../../application/ports/dependency-watcher/dependency-import-queue.publisher.js';
import { RabbitMqDependencyCheckQueuePublisher } from '../queue/rabbitmq-dependency-check-queue.publisher.js';
import { RabbitMqDependencyImportQueuePublisher } from '../queue/rabbitmq-dependency-import-queue.publisher.js';
import { DatabaseModule } from './database.module.js';
import { NotesModule } from './notes.module.js';
import { AuthModule } from './auth.module.js';
import { EnvModule } from './env.module.js';
import { LoggerModule } from './logger.module.js';
import { EmailModule } from './email.module.js';
import { AiModule } from './ai.module.js';
import { WorkspacesModule } from './workspaces.module.js';
import { CheckDependencyUseCase } from '../../application/use-cases/dependency-watcher/check-dependency.use-case.js';

@Module({
  imports: [
    DatabaseModule,
    NotesModule,
    AuthModule,
    EnvModule,
    LoggerModule,
    EmailModule,
    AiModule,
    WorkspacesModule,
  ],
  providers: [
    RegistryStrategyProvider,
    DefaultDependencyAlertGateway,
    RabbitMqDependencyCheckQueuePublisher,
    RabbitMqDependencyImportQueuePublisher,
    DependencyAlertNotificationService,
    DependencyWatcherService,
    DependencyWatcherWorker,
    DependencyImportWorker,
    CheckDependencyUseCase,
    {
      provide: DependencyAlertGateway,
      useExisting: DefaultDependencyAlertGateway,
    },
    {
      provide: DependencyCheckQueuePublisher,
      useExisting: RabbitMqDependencyCheckQueuePublisher,
    },
    {
      provide: DependencyImportQueuePublisher,
      useExisting: RabbitMqDependencyImportQueuePublisher,
    },
  ],
  exports: [
    DependencyAlertNotificationService,
    DependencyWatcherService,
    DependencyWatcherWorker,
    CheckDependencyUseCase,
    DependencyAlertGateway,
    DependencyCheckQueuePublisher,
    DependencyImportQueuePublisher,
  ],
})
export class DependencyWatcherModule {}

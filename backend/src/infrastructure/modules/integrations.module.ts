import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { QueueModule } from './queue.module.js';
import { AiModule } from './ai.module.js';
import { NotesModule } from './notes.module.js';
import { RemindersModule } from './reminders.module.js';
import { OperationsModule } from './operations.module.js';
import { WorkspacesModule } from './workspaces.module.js';
import { EmailModule } from './email.module.js';
import { QuotaModule } from './quota.module.js';
import { ProjectsModule } from './projects.module.js';
import { DependencyWatcherModule } from './dependency-watcher.module.js';

import {
  IntegrationConnectionService,
} from '../../application/integration-connections.js';
import {
  IntegrationCredentialService,
} from '../../application/credentials.js';
import { PostgresWorkspaceRepository } from '../repositories/workspace.repository.js';
import {
  HandleGithubPushUseCase,
  HandleGithubPullRequestUseCase,
  HandleWhatsappWebhookUseCase,
  HandleTelegramWebhookUseCase,
  GithubBackfillUseCase,
  ListWebhookSubscriptionsUseCase,
  CreateWebhookSubscriptionUseCase,
  UpdateWebhookSubscriptionUseCase,
  DeleteWebhookSubscriptionUseCase,
  IngestEntryUseCase,
} from '../../application/use-cases/index.js';
import { ImportDependenciesFromGithubUseCase } from '../../application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';
import { ListDependencyMonitoredRepositoriesUseCase } from '../../application/use-cases/dependency-watcher/list-dependency-monitored-repositories.use-case.js';
import { SaveDependencyMonitoredRepositoriesUseCase } from '../../application/use-cases/dependency-watcher/save-dependency-monitored-repositories.use-case.js';
import { CheckProjectDependenciesUseCase } from '../../application/use-cases/dependency-watcher/check-project-dependencies.use-case.js';
import { CheckDependencyUseCase } from '../../application/use-cases/dependency-watcher/check-dependency.use-case.js';
import { DependencyWatcherRepository } from '../../application/ports/dependency-watcher/dependency-watcher.repository.js';
import { WebhookDeliveryService } from '../../application/services/webhooks/webhook-delivery.service.js';
import { WebhookDeliveryWorker } from '../../application/workers/webhook-delivery.worker.js';
import { ProcessGithubPushService } from '../../application/services/integrations/process-github-push.service.js';
import { GithubBackfillRunnerService } from '../../application/services/integrations/github-backfill-runner.service.js';
import { GithubBackfillJobRepository } from '../../application/ports/integrations/github-backfill-job.repository.js';
import { BackfillQueuePublisher } from '../../application/ports/integrations/backfill-queue.publisher.js';
import { PostgresGithubBackfillJobRepository } from '../repositories/github-backfill-job.repository.js';
import { RabbitMqBackfillQueuePublisher } from '../queue/rabbitmq-backfill-queue.publisher.js';
import { RabbitMqBackfillQueueConsumer } from '../queue/rabbitmq-backfill-queue.consumer.js';
import { RabbitMqDependencyCheckQueuePublisher } from '../queue/rabbitmq-dependency-check-queue.publisher.js';
import { RabbitMqDependencyCheckQueueConsumer } from '../queue/rabbitmq-dependency-check-queue.consumer.js';
import { RabbitMqDependencyImportQueuePublisher } from '../queue/rabbitmq-dependency-import-queue.publisher.js';
import { RabbitMqDependencyImportQueueConsumer } from '../queue/rabbitmq-dependency-import-queue.consumer.js';

import {
  UserIntegrationsController,
  InternalIntegrationsController,
  WebhookController,
  WebhookSubscriptionsController,
  GithubAppCallbackController,
  DependencyWatcherController,
} from '../../interfaces/http/controllers/index.js';
import { NotifyHighSeverityFindingsService } from '../../application/use-cases/notifications/notify-high-severity-findings.use-case.js';

@Module({
  imports: [
    LoggerModule,
    EnvModule,
    DatabaseModule,
    AuthModule,
    QueueModule,
    AiModule,
    NotesModule,
    RemindersModule,
    OperationsModule,
    WorkspacesModule,
    EmailModule,
    QuotaModule,
    ProjectsModule,
    DependencyWatcherModule,
  ],
  controllers: [
    UserIntegrationsController,
    InternalIntegrationsController,
    WebhookController,
    WebhookSubscriptionsController,
    GithubAppCallbackController,
    DependencyWatcherController,
  ],
  providers: [
    IntegrationConnectionService,
    IntegrationCredentialService,
    ProcessGithubPushService,
    HandleGithubPushUseCase,
    HandleGithubPullRequestUseCase,
    HandleWhatsappWebhookUseCase,
    HandleTelegramWebhookUseCase,
    GithubBackfillUseCase,
    GithubBackfillRunnerService,
    { provide: GithubBackfillJobRepository, useClass: PostgresGithubBackfillJobRepository },
    { provide: BackfillQueuePublisher, useClass: RabbitMqBackfillQueuePublisher },
    RabbitMqBackfillQueuePublisher,
    RabbitMqBackfillQueueConsumer,
    RabbitMqDependencyCheckQueuePublisher,
    RabbitMqDependencyCheckQueueConsumer,
    RabbitMqDependencyImportQueuePublisher,
    RabbitMqDependencyImportQueueConsumer,
    NotifyHighSeverityFindingsService,
    WebhookDeliveryService,
    WebhookDeliveryWorker,
    ListWebhookSubscriptionsUseCase,
    CreateWebhookSubscriptionUseCase,
    UpdateWebhookSubscriptionUseCase,
    DeleteWebhookSubscriptionUseCase,
    IngestEntryUseCase,
    ImportDependenciesFromGithubUseCase,
    ListDependencyMonitoredRepositoriesUseCase,
    SaveDependencyMonitoredRepositoriesUseCase,
    CheckProjectDependenciesUseCase,
    CheckDependencyUseCase,
    PostgresWorkspaceRepository,
  ],
  exports: [
    IntegrationConnectionService,
    IntegrationCredentialService,
    WebhookDeliveryService,
    WebhookDeliveryWorker,
  ],
})
export class IntegrationsModule {}

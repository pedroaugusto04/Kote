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
} from '../../application/services/integrations/integration-connection.service.js';
import {
  IntegrationCredentialService,
} from '../../application/services/integrations/integration-credentials.service.js';
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
} from '../../application/use-cases/index.js';
import { ImportDependenciesFromGithubUseCase } from '../../application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';
import { WhatsappConversationTaskQueue, WhatsappWebhookRateLimiter } from '../../application/use-cases/webhooks/whatsapp/whatsapp-webhook-flow-control.js';
import { WhatsappMediaProcessorService } from '../../application/use-cases/webhooks/whatsapp/whatsapp-media-processor.service.js';
import { GithubPrCommentSyncService } from '../../application/use-cases/webhooks/github/github-pr-comment-sync.service.js';
import { RouteGithubWebhookUseCase } from '../../application/use-cases/webhooks/github/route-github-webhook.use-case.js';
import { ListDependencyMonitoredRepositoriesUseCase } from '../../application/use-cases/dependency-watcher/list-dependency-monitored-repositories.use-case.js';
import { SaveDependencyMonitoredRepositoriesUseCase } from '../../application/use-cases/dependency-watcher/save-dependency-monitored-repositories.use-case.js';
import { CheckProjectDependenciesUseCase } from '../../application/use-cases/dependency-watcher/check-project-dependencies.use-case.js';
import { WebhookDeliveryService } from '../../application/services/webhooks/webhook-delivery.service.js';
import { WebhookDeliveryWorker } from '../../application/workers/webhook-delivery.worker.js';
import { ProcessGithubPushService } from '../../application/services/integrations/process-github-push.service.js';
import { GithubBackfillRunnerService } from '../../application/services/integrations/github-backfill-runner.service.js';
import { GithubBackfillJobRepository } from '../../application/ports/integrations/github-backfill-job.repository.js';
import { BackfillQueuePublisher } from '../../application/ports/integrations/backfill-queue.publisher.js';
import { PostgresGithubBackfillJobRepository } from '../repositories/github-backfill-job.repository.js';
import { RabbitMqBackfillQueuePublisher } from '../queue/rabbitmq-backfill-queue.publisher.js';
import { RabbitMqBackfillQueueConsumer } from '../queue/rabbitmq-backfill-queue.consumer.js';
import { RabbitMqDependencyCheckQueueConsumer } from '../queue/rabbitmq-dependency-check-queue.consumer.js';
import { RabbitMqDependencyImportQueueConsumer } from '../queue/rabbitmq-dependency-import-queue.consumer.js';

import {
  UserIntegrationsController,
  InternalIntegrationsController,
  WebhookController,
  WebhookSubscriptionsController,
  GithubAppCallbackController,
  DependencyWatcherController,
} from '../../interfaces/http/controllers/index.js';

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
    RouteGithubWebhookUseCase,
    HandleGithubPushUseCase,
    GithubPrCommentSyncService,
    HandleGithubPullRequestUseCase,
    WhatsappMediaProcessorService,
    HandleWhatsappWebhookUseCase,
    WhatsappWebhookRateLimiter,
    WhatsappConversationTaskQueue,
    HandleTelegramWebhookUseCase,
    GithubBackfillUseCase,
    GithubBackfillRunnerService,
    PostgresGithubBackfillJobRepository,
    { provide: GithubBackfillJobRepository, useExisting: PostgresGithubBackfillJobRepository },
    RabbitMqBackfillQueuePublisher,
    { provide: BackfillQueuePublisher, useExisting: RabbitMqBackfillQueuePublisher },
    RabbitMqBackfillQueueConsumer,
    RabbitMqDependencyCheckQueueConsumer,
    RabbitMqDependencyImportQueueConsumer,
    WebhookDeliveryService,
    WebhookDeliveryWorker,
    ListWebhookSubscriptionsUseCase,
    CreateWebhookSubscriptionUseCase,
    UpdateWebhookSubscriptionUseCase,
    DeleteWebhookSubscriptionUseCase,
    ImportDependenciesFromGithubUseCase,
    ListDependencyMonitoredRepositoriesUseCase,
    SaveDependencyMonitoredRepositoriesUseCase,
    CheckProjectDependenciesUseCase,
  ],
  exports: [
    IntegrationConnectionService,
    IntegrationCredentialService,
    WebhookDeliveryService,
    WebhookDeliveryWorker,
  ],
})
export class IntegrationsModule {}

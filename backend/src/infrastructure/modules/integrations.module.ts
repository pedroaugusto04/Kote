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

import {
  IntegrationConnectionService,
} from '../../application/integration-connections.js';
import {
  IntegrationCredentialService,
} from '../../application/credentials.js';
import {
  HandleGithubPushUseCase,
  HandleGithubPullRequestUseCase,
  HandleWhatsappWebhookUseCase,
  HandleTelegramWebhookUseCase,
  ListWebhookSubscriptionsUseCase,
  CreateWebhookSubscriptionUseCase,
  UpdateWebhookSubscriptionUseCase,
  DeleteWebhookSubscriptionUseCase,
  IngestEntryUseCase,
} from '../../application/use-cases/index.js';
import { WebhookDeliveryService } from '../../application/services/webhook-delivery.service.js';
import { WebhookDeliveryWorker } from '../../application/services/webhook-delivery.worker.js';

import {
  UserIntegrationsController,
  InternalIntegrationsController,
  WebhookController,
  WebhookSubscriptionsController,
  GithubAppCallbackController,
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
  ],
  controllers: [
    UserIntegrationsController,
    InternalIntegrationsController,
    WebhookController,
    WebhookSubscriptionsController,
    GithubAppCallbackController,
  ],
  providers: [
    IntegrationConnectionService,
    IntegrationCredentialService,
    HandleGithubPushUseCase,
    HandleGithubPullRequestUseCase,
    HandleWhatsappWebhookUseCase,
    HandleTelegramWebhookUseCase,
    NotifyHighSeverityFindingsService,
    WebhookDeliveryService,
    WebhookDeliveryWorker,
    ListWebhookSubscriptionsUseCase,
    CreateWebhookSubscriptionUseCase,
    UpdateWebhookSubscriptionUseCase,
    DeleteWebhookSubscriptionUseCase,
    IngestEntryUseCase,
  ],
  exports: [
    IntegrationConnectionService,
    IntegrationCredentialService,
    WebhookDeliveryService,
    WebhookDeliveryWorker,
  ],
})
export class IntegrationsModule {}

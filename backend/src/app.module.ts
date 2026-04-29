import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthService } from './application/auth.js';
import { IntegrationConnectionService } from './application/integration-connections.js';
import { IntegrationCredentialService } from './application/credentials.js';
import { SchemaMigrator, UserRepository } from './application/ports/auth.repository.js';
import { ContentQueryRepository, ContentRepository } from './application/ports/content.repository.js';
import {
  CredentialRepository,
  ExternalIdentityRepository,
  IntegrationConnectionSessionRepository,
} from './application/ports/integrations.repository.js';
import { WebhookEventRepository } from './application/ports/webhook-events.repository.js';
import { WhatsappReplySender } from './application/ports/whatsapp-reply.sender.js';
import { ConversationStateRepository, ReminderDispatchRepository } from './application/ports/workflow-state.repository.js';
import { EvolutionWhatsappReplySender } from './adapters/evolution.js';
import { PostgresUserRepository } from './infrastructure/repositories/auth.repository.js';
import { PostgresContentQueryRepository } from './infrastructure/repositories/content-query.repository.js';
import { PostgresContentRepository } from './infrastructure/repositories/content.repository.js';
import { PostgresDatabase } from './infrastructure/persistence/database.js';
import { PostgresIntegrationRepository } from './infrastructure/repositories/integrations.repository.js';
import { PostgresSchemaMigrator } from './infrastructure/persistence/schema.migrator.js';
import { PostgresWebhookEventRepository } from './infrastructure/repositories/webhook-events.repository.js';
import { PostgresWorkflowStateRepository } from './infrastructure/repositories/workflow-state.repository.js';
import {
  BuildDashboardUseCase,
  BuildReminderDispatchUseCase,
  CreateManualNoteUseCase,
  CreateProjectUseCase,
  CreateWorkspaceUseCase,
  GetNoteDetailUseCase,
  HandleGithubPushUseCase,
  HandleTelegramWebhookUseCase,
  HandleWhatsappWebhookUseCase,
  IngestEntryUseCase,
  MarkReminderAsSentUseCase,
  ProcessConversationUseCase,
  QueryKnowledgeUseCase,
} from './application/use-cases/index.js';
import { AuthController, DashboardController, HealthController, InternalIntegrationsController, InternalN8NController, NotesController, OperationsController, ProjectsController, UserIntegrationsController, WebhookController, WorkspacesController } from './interfaces/http/controllers/index.js';
import { AccessTokenAuthGuard, AuthRateLimitGuard, GlobalRateLimitGuard, InternalServiceTokenGuard, TrustedOriginGuard, WebhookRateLimitGuard } from './interfaces/http/auth.guards.js';
import { GlobalExceptionFilter } from './observability/global-exception.filter.js';
import { AppLogger } from './observability/logger.js';

@Module({
  controllers: [HealthController, DashboardController, WorkspacesController, ProjectsController, NotesController, AuthController, UserIntegrationsController, InternalIntegrationsController, OperationsController, InternalN8NController, WebhookController],
  providers: [
    AuthService,
    AccessTokenAuthGuard,
    AuthRateLimitGuard,
    GlobalRateLimitGuard,
    TrustedOriginGuard,
    InternalServiceTokenGuard,
    WebhookRateLimitGuard,
    AppLogger,
    GlobalExceptionFilter,
    BuildDashboardUseCase,
    CreateWorkspaceUseCase,
    CreateProjectUseCase,
    CreateManualNoteUseCase,
    IntegrationConnectionService,
    IntegrationCredentialService,
    GetNoteDetailUseCase,
    QueryKnowledgeUseCase,
    IngestEntryUseCase,
    ProcessConversationUseCase,
    BuildReminderDispatchUseCase,
    MarkReminderAsSentUseCase,
    HandleGithubPushUseCase,
    HandleWhatsappWebhookUseCase,
    HandleTelegramWebhookUseCase,
    EvolutionWhatsappReplySender,
    PostgresDatabase,
    PostgresSchemaMigrator,
    PostgresUserRepository,
    PostgresIntegrationRepository,
    PostgresContentRepository,
    PostgresContentQueryRepository,
    PostgresWorkflowStateRepository,
    PostgresWebhookEventRepository,
    { provide: SchemaMigrator, useExisting: PostgresSchemaMigrator },
    { provide: UserRepository, useExisting: PostgresUserRepository },
    { provide: CredentialRepository, useExisting: PostgresIntegrationRepository },
    { provide: ExternalIdentityRepository, useExisting: PostgresIntegrationRepository },
    { provide: IntegrationConnectionSessionRepository, useExisting: PostgresIntegrationRepository },
    { provide: ContentRepository, useExisting: PostgresContentRepository },
    { provide: ContentQueryRepository, useExisting: PostgresContentQueryRepository },
    { provide: ConversationStateRepository, useExisting: PostgresWorkflowStateRepository },
    { provide: ReminderDispatchRepository, useExisting: PostgresWorkflowStateRepository },
    { provide: WebhookEventRepository, useExisting: PostgresWebhookEventRepository },
    { provide: WhatsappReplySender, useExisting: EvolutionWhatsappReplySender },
    { provide: APP_GUARD, useClass: GlobalRateLimitGuard },
  ],
})
export class AppModule {}

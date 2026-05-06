import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthService } from './application/auth.js';
import { IntegrationConnectionService } from './application/integration-connections.js';
import { IntegrationCredentialService } from './application/credentials.js';
import { ConversationExtractionGateway } from './application/ports/conversation-extraction.port.js';
import { GithubIntegrationGateway } from './application/ports/github-integration.port.js';
import { ReviewAnalysisGateway } from './application/ports/review-analysis.port.js';
import { RuntimeEnvironmentProvider } from './application/ports/runtime-environment.port.js';
import { ContentObjectStorageService } from './application/services/content-object-storage.service.js';
import { GithubRepositoryResolutionService } from './application/services/github-repository-resolution.service.js';
import { SchemaMigrator, UserRepository } from './application/ports/auth.repository.js';
import { ContentQueryRepository, ContentRepository } from './application/ports/content.repository.js';
import { ObjectStorage } from './application/ports/object-storage.js';
import {
  CredentialRepository,
  ExternalIdentityRepository,
  IntegrationConnectionSessionRepository,
} from './application/ports/integrations.repository.js';
import { WebhookEventRepository } from './application/ports/webhook-events.repository.js';
import { TelegramMessageSender } from './application/ports/telegram-message.sender.js';
import { WhatsappReplySender } from './application/ports/whatsapp-reply.sender.js';
import { ConversationStateRepository, ReminderDispatchRepository } from './application/ports/workflow-state.repository.js';
import { TelegramHttpMessageSender } from './adapters/telegram.js';
import { EvolutionWhatsappReplySender } from './adapters/evolution.js';
import { DefaultConversationExtractionGateway } from './infrastructure/ai/conversation-extraction.gateway.js';
import { DefaultReviewAnalysisGateway } from './infrastructure/ai/review-analysis.gateway.js';
import { DefaultGithubIntegrationGateway } from './infrastructure/integrations/github-integration.gateway.js';
import { PostgresUserRepository } from './infrastructure/repositories/auth.repository.js';
import { PostgresContentQueryRepository } from './infrastructure/repositories/content-query.repository.js';
import { PostgresContentRepository } from './infrastructure/repositories/content.repository.js';
import { PostgresDatabase } from './infrastructure/persistence/database.js';
import { PostgresIntegrationRepository } from './infrastructure/repositories/integrations.repository.js';
import { PostgresSchemaMigrator } from './infrastructure/persistence/schema.migrator.js';
import { PostgresWebhookEventRepository } from './infrastructure/repositories/webhook-events.repository.js';
import { PostgresWorkflowStateRepository } from './infrastructure/repositories/workflow-state.repository.js';
import { ProcessRuntimeEnvironmentProvider } from './infrastructure/runtime/runtime-environment.provider.js';
import { SupabaseObjectStorage } from './infrastructure/storage/supabase-object-storage.js';
import {
  BuildDashboardUseCase,
  BuildReminderDispatchUseCase,
  CreateManualNoteUseCase,
  CreateProjectUseCase,
  CreateWorkspaceUseCase,
  DispatchDueTelegramRemindersUseCase,
  DeleteManualNoteUseCase,
  DeleteProjectUseCase,
  GetNoteDetailUseCase,
  GetReviewDetailUseCase,
  HandleGithubPushUseCase,
  HandleTelegramWebhookUseCase,
  HandleWhatsappWebhookUseCase,
  IngestEntryUseCase,
  ListPaginatedNotesUseCase,
  ListPaginatedProjectsUseCase,
  ListPaginatedRemindersUseCase,
  ListPaginatedReviewsUseCase,
  MarkReminderAsSentUseCase,
  ProcessConversationUseCase,
  QueryKnowledgeUseCase,
  UpdateManualNoteUseCase,
  UpdateProjectUseCase,
  ListWorkspacesUseCase,
  ListWorkspaceRepositoriesUseCase,
} from './application/use-cases/index.js';
import { TelegramReminderDispatchWorker } from './application/services/telegram-reminder-dispatch.worker.js';
import { AuthController, DashboardController, GithubAppCallbackController, HealthController, InternalIntegrationsController, InternalN8NController, NotesController, OperationsController, ProjectsController, UserIntegrationsController, WebhookController, WorkspacesController } from './interfaces/http/controllers/index.js';
import { AccessTokenAuthGuard, AuthRateLimitGuard, GlobalRateLimitGuard, InternalServiceTokenGuard, TrustedOriginGuard, WebhookRateLimitGuard } from './interfaces/http/auth.guards.js';
import { GlobalExceptionFilter } from './observability/global-exception.filter.js';
import { AppLogger } from './observability/logger.js';

@Module({
  controllers: [HealthController, DashboardController, WorkspacesController, ProjectsController, NotesController, AuthController, UserIntegrationsController, GithubAppCallbackController, InternalIntegrationsController, OperationsController, InternalN8NController, WebhookController],
  providers: [
    AuthService,
    AccessTokenAuthGuard,
    AuthRateLimitGuard,
    GlobalRateLimitGuard, // TODO: trocar pra redis em caso de multiplos servidores
    TrustedOriginGuard,
    InternalServiceTokenGuard,
    WebhookRateLimitGuard,
    AppLogger,
    GlobalExceptionFilter,
    BuildDashboardUseCase,
    ListPaginatedProjectsUseCase,
    ListWorkspacesUseCase,
    ListPaginatedNotesUseCase,
    ListPaginatedReviewsUseCase,
    ListPaginatedRemindersUseCase,
    CreateWorkspaceUseCase,
    CreateProjectUseCase,
    UpdateProjectUseCase,
    DeleteProjectUseCase,
    CreateManualNoteUseCase,
    UpdateManualNoteUseCase,
    DeleteManualNoteUseCase,
    ListWorkspaceRepositoriesUseCase,
    IntegrationConnectionService,
    IntegrationCredentialService,
    ContentObjectStorageService,
    GithubRepositoryResolutionService,
    GetNoteDetailUseCase,
    GetReviewDetailUseCase,
    QueryKnowledgeUseCase,
    IngestEntryUseCase,
    ProcessConversationUseCase,
    BuildReminderDispatchUseCase,
    DispatchDueTelegramRemindersUseCase,
    MarkReminderAsSentUseCase,
    HandleGithubPushUseCase,
    HandleWhatsappWebhookUseCase,
    HandleTelegramWebhookUseCase,
    TelegramReminderDispatchWorker,
    EvolutionWhatsappReplySender,
    TelegramHttpMessageSender,
    DefaultConversationExtractionGateway,
    DefaultReviewAnalysisGateway,
    DefaultGithubIntegrationGateway,
    ProcessRuntimeEnvironmentProvider,
    PostgresDatabase,
    PostgresSchemaMigrator,
    PostgresUserRepository,
    PostgresIntegrationRepository,
    PostgresContentRepository,
    PostgresContentQueryRepository,
    PostgresWorkflowStateRepository,
    PostgresWebhookEventRepository,
    SupabaseObjectStorage,
    { provide: SchemaMigrator, useExisting: PostgresSchemaMigrator },
    { provide: UserRepository, useExisting: PostgresUserRepository },
    { provide: RuntimeEnvironmentProvider, useExisting: ProcessRuntimeEnvironmentProvider },
    { provide: ConversationExtractionGateway, useExisting: DefaultConversationExtractionGateway },
    { provide: CredentialRepository, useExisting: PostgresIntegrationRepository },
    { provide: ExternalIdentityRepository, useExisting: PostgresIntegrationRepository },
    { provide: IntegrationConnectionSessionRepository, useExisting: PostgresIntegrationRepository },
    { provide: GithubIntegrationGateway, useExisting: DefaultGithubIntegrationGateway },
    { provide: ReviewAnalysisGateway, useExisting: DefaultReviewAnalysisGateway },
    { provide: ContentRepository, useExisting: PostgresContentRepository },
    { provide: ContentQueryRepository, useExisting: PostgresContentQueryRepository },
    { provide: ObjectStorage, useExisting: SupabaseObjectStorage },
    { provide: ConversationStateRepository, useExisting: PostgresWorkflowStateRepository },
    { provide: ReminderDispatchRepository, useExisting: PostgresWorkflowStateRepository },
    { provide: WebhookEventRepository, useExisting: PostgresWebhookEventRepository },
    { provide: WhatsappReplySender, useExisting: EvolutionWhatsappReplySender },
    { provide: TelegramMessageSender, useExisting: TelegramHttpMessageSender },
    { provide: APP_GUARD, useClass: GlobalRateLimitGuard },
  ],
})
export class AppModule { }

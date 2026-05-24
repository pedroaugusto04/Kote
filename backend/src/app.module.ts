import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthService } from './application/auth.js';
import { IntegrationConnectionService } from './application/integration-connections.js';
import { IntegrationCredentialService } from './application/credentials.js';
import { ConversationAgentGateway } from './application/ports/conversation-agent.gateway.js'; 
import { GithubIntegrationGateway } from './application/ports/github-integration.port.js';
import { GoogleOAuthGateway } from './application/ports/google-oauth.gateway.js';
import { ProjectBriefAiGateway } from './application/ports/project-brief-ai.gateway.js';
import { NoteEmbeddingRepository } from './application/ports/note-embedding.repository.js';
import { EmbeddingGateway } from './application/ports/embedding.gateway.js';
import { AnswerGenerationGateway } from './application/ports/answer-generation.gateway.js';
import { EmbeddingQueuePublisher } from './application/ports/embedding-queue.publisher.js';
import { ProjectBriefHistoryRepository } from './application/ports/project-brief-history.repository.js';
import { AskHistoryRepository } from './application/ports/ask-history.repository.js';
import { ReminderDeliveryGateway } from './application/ports/reminder-delivery.gateway.js';
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
import { WhatsappMediaDownloader } from './application/ports/whatsapp-media.downloader.js';
import { WhatsappReplySender } from './application/ports/whatsapp-reply.sender.js';
import { ConversationStateRepository, ReminderDispatchRepository } from './application/ports/workflow-state.repository.js';
import { TelegramHttpMessageSender, TelegramReminderDeliveryGateway } from './adapters/telegram.js';
import { EvolutionReminderDeliveryGateway, EvolutionWhatsappMediaDownloader, EvolutionWhatsappReplySender } from './adapters/evolution.js';
import { DefaultConversationAgentGateway } from './infrastructure/ai/conversation-agent.gateway.js';
import { DefaultProjectBriefAiGateway } from './infrastructure/ai/project-brief.gateway.js';
import { DefaultReviewAnalysisGateway } from './infrastructure/ai/review-analysis.gateway.js';
import { DefaultEmbeddingGateway } from './infrastructure/ai/embedding.gateway.js';
import { DefaultAnswerGenerationGateway } from './infrastructure/ai/answer-generation.gateway.js';
import { DefaultGithubIntegrationGateway } from './infrastructure/integrations/github-integration.gateway.js';
import { GoogleAuthLibraryOAuthGateway } from './infrastructure/auth/google-oauth.gateway.js';
import { PostgresUserRepository } from './infrastructure/repositories/auth.repository.js';
import { PostgresContentQueryRepository } from './infrastructure/repositories/content-query.repository.js';
import { PostgresContentRepository } from './infrastructure/repositories/content.repository.js';
import { PostgresDatabase } from './infrastructure/persistence/database.js';
import { PostgresIntegrationRepository } from './infrastructure/repositories/integrations.repository.js';
import { PostgresNoteEmbeddingRepository } from './infrastructure/repositories/note-embedding.repository.js';
import { PostgresProjectBriefHistoryRepository } from './infrastructure/repositories/project-brief-history.repository.js';
import { PostgresAskHistoryRepository } from './infrastructure/repositories/ask-history.repository.js';
import { PostgresSchemaMigrator } from './infrastructure/persistence/schema.migrator.js';
import { PostgresWebhookEventRepository } from './infrastructure/repositories/webhook-events.repository.js';
import { PostgresWorkflowStateRepository } from './infrastructure/repositories/workflow-state.repository.js';
import { ProcessRuntimeEnvironmentProvider } from './infrastructure/runtime/runtime-environment.provider.js';
import { SupabaseObjectStorage } from './infrastructure/storage/supabase-object-storage.js';
import { RabbitMqEmbeddingQueuePublisher } from './infrastructure/queue/rabbitmq-embedding-queue.publisher.js';
import {
  BuildDashboardUseCase,
  BuildReminderDispatchUseCase,
  CreateManualNoteUseCase,
  CreateProjectFolderUseCase,
  CreateProjectUseCase,
  CreateWorkspaceUseCase,
  DispatchDueRemindersUseCase,
  DispatchDueTelegramRemindersUseCase,
  DeleteProjectFolderUseCase,
  DeleteNoteUseCase,
  DeleteProjectUseCase,
  GetNoteAttachmentContentUseCase,
  GetNoteDetailUseCase,
  GetReviewDetailUseCase,
  GenerateProjectBriefUseCase,
  GetProjectBriefUseCase,
  HandleGithubPushUseCase,
  HandleTelegramWebhookUseCase,
  HandleWhatsappWebhookUseCase,
  IngestEntryUseCase,
  ListReminderBoardUseCase,
  ListPaginatedNotesUseCase,
  ListPaginatedProjectsUseCase,
  ListPaginatedRemindersUseCase,
  ListPaginatedReviewsUseCase,
  ListProjectTimelineUseCase,
  MarkReminderAsSentUseCase,
  ProcessAgentConversationUseCase,
  QueryKnowledgeUseCase,
  AskKnowledgeUseCase,
  RunAskAiUseCase,
  ListAskHistoryUseCase,
  RefreshReminderStatusesUseCase,
  ListProjectFoldersUseCase,
  UpdateNoteUseCase,
  UpdateReminderStatusUseCase,
  UpdateProjectFolderUseCase,
  UpdateProjectUseCase,
  ListWorkspacesUseCase,
  ListWorkspaceRepositoriesUseCase,
  ReindexAllEmbeddingsUseCase,
  LogApplicationAccessUseCase,
} from './application/use-cases/index.js';
import { ReminderDispatchWorker } from './application/services/reminder-dispatch.worker.js';
import { EmbeddingWorker } from './application/services/embedding.worker.js';
import { NoteChunkingService } from './application/services/note-chunking.service.js';
import { ConversationAgentPresenter } from './application/use-cases/conversation/services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from './application/use-cases/conversation/services/conversation-folder-resolution.service.js';
import { ApplicationAccessController, AuthController, DashboardController, GithubAppCallbackController, HealthController, InternalIntegrationsController, InternalN8NController, NotesController, OperationsController, ProjectsController, UserIntegrationsController, WebhookController, WorkspacesController } from './interfaces/http/controllers/index.js';
import { AccessTokenAuthGuard, AuthRateLimitGuard, GlobalRateLimitGuard, InternalServiceTokenGuard, TrustedOriginGuard, WebhookRateLimitGuard } from './interfaces/http/auth.guards.js';
import { GlobalExceptionFilter } from './observability/global-exception.filter.js';
import { AppLogger } from './observability/logger.js';

@Module({
  controllers: [HealthController, ApplicationAccessController, DashboardController, WorkspacesController, ProjectsController, NotesController, AuthController, UserIntegrationsController, GithubAppCallbackController, InternalIntegrationsController, OperationsController, InternalN8NController, WebhookController],
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
    LogApplicationAccessUseCase,
    BuildDashboardUseCase,
    ListPaginatedProjectsUseCase,
    ListWorkspacesUseCase,
    ListPaginatedNotesUseCase,
    ListPaginatedReviewsUseCase,
    ListPaginatedRemindersUseCase,
    ListReminderBoardUseCase,
    CreateWorkspaceUseCase,
    CreateProjectUseCase,
    UpdateProjectUseCase,
    DeleteProjectUseCase,
    ListProjectFoldersUseCase,
    ListProjectTimelineUseCase,
    CreateProjectFolderUseCase,
    UpdateProjectFolderUseCase,
    DeleteProjectFolderUseCase,
    CreateManualNoteUseCase,
    UpdateNoteUseCase,
    DeleteNoteUseCase,
    GetNoteAttachmentContentUseCase,
    ListWorkspaceRepositoriesUseCase,
    IntegrationConnectionService,
    IntegrationCredentialService,
    ContentObjectStorageService,
    GithubRepositoryResolutionService,
    GetNoteDetailUseCase,
    GetReviewDetailUseCase,
    QueryKnowledgeUseCase,
    GenerateProjectBriefUseCase,
    GetProjectBriefUseCase,
    IngestEntryUseCase,
    ProcessAgentConversationUseCase,
    ConversationAgentPresenter,
    ConversationFolderResolutionService,
    BuildReminderDispatchUseCase,
    DispatchDueRemindersUseCase,
    DispatchDueTelegramRemindersUseCase,
    MarkReminderAsSentUseCase,
    RefreshReminderStatusesUseCase,
    UpdateReminderStatusUseCase,
    HandleGithubPushUseCase,
    HandleWhatsappWebhookUseCase,
    HandleTelegramWebhookUseCase,
    ReminderDispatchWorker,
    EmbeddingWorker,
    NoteChunkingService,
    ReindexAllEmbeddingsUseCase,
    AskKnowledgeUseCase,
    RunAskAiUseCase,
    ListAskHistoryUseCase,
    EvolutionWhatsappReplySender,
    EvolutionReminderDeliveryGateway,
    EvolutionWhatsappMediaDownloader,
    TelegramHttpMessageSender,
    TelegramReminderDeliveryGateway,
    DefaultConversationAgentGateway,
    DefaultProjectBriefAiGateway,
    DefaultReviewAnalysisGateway,
    DefaultEmbeddingGateway,
    DefaultAnswerGenerationGateway,
    DefaultGithubIntegrationGateway,
    GoogleAuthLibraryOAuthGateway,
    ProcessRuntimeEnvironmentProvider,
    PostgresDatabase,
    PostgresSchemaMigrator,
    PostgresUserRepository,
    PostgresIntegrationRepository,
    PostgresProjectBriefHistoryRepository,
    PostgresAskHistoryRepository,
    PostgresContentRepository,
    PostgresContentQueryRepository,
    PostgresNoteEmbeddingRepository,
    PostgresWorkflowStateRepository,
    PostgresWebhookEventRepository,
    SupabaseObjectStorage,
    RabbitMqEmbeddingQueuePublisher,
    { provide: SchemaMigrator, useExisting: PostgresSchemaMigrator },
    { provide: UserRepository, useExisting: PostgresUserRepository },
    { provide: RuntimeEnvironmentProvider, useExisting: ProcessRuntimeEnvironmentProvider },
    { provide: ConversationAgentGateway, useExisting: DefaultConversationAgentGateway },
    { provide: ProjectBriefAiGateway, useExisting: DefaultProjectBriefAiGateway },
    { provide: ProjectBriefHistoryRepository, useExisting: PostgresProjectBriefHistoryRepository },
    { provide: AskHistoryRepository, useExisting: PostgresAskHistoryRepository },
    { provide: CredentialRepository, useExisting: PostgresIntegrationRepository },
    { provide: ExternalIdentityRepository, useExisting: PostgresIntegrationRepository },
    { provide: IntegrationConnectionSessionRepository, useExisting: PostgresIntegrationRepository },
    { provide: GithubIntegrationGateway, useExisting: DefaultGithubIntegrationGateway },
    { provide: GoogleOAuthGateway, useExisting: GoogleAuthLibraryOAuthGateway },
    { provide: ReviewAnalysisGateway, useExisting: DefaultReviewAnalysisGateway },
    { provide: ContentRepository, useExisting: PostgresContentRepository },
    { provide: ContentQueryRepository, useExisting: PostgresContentQueryRepository },
    { provide: NoteEmbeddingRepository, useExisting: PostgresNoteEmbeddingRepository },
    { provide: EmbeddingQueuePublisher, useExisting: RabbitMqEmbeddingQueuePublisher },
    { provide: EmbeddingGateway, useExisting: DefaultEmbeddingGateway },
    { provide: AnswerGenerationGateway, useExisting: DefaultAnswerGenerationGateway },
    { provide: ObjectStorage, useExisting: SupabaseObjectStorage },
    { provide: ConversationStateRepository, useExisting: PostgresWorkflowStateRepository },
    { provide: ReminderDispatchRepository, useExisting: PostgresWorkflowStateRepository },
    { provide: WebhookEventRepository, useExisting: PostgresWebhookEventRepository },
    { provide: WhatsappReplySender, useExisting: EvolutionWhatsappReplySender },
    { provide: WhatsappMediaDownloader, useExisting: EvolutionWhatsappMediaDownloader },
    { provide: TelegramMessageSender, useExisting: TelegramHttpMessageSender },
    { provide: ReminderDeliveryGateway, useExisting: EvolutionReminderDeliveryGateway },
    { provide: APP_GUARD, useClass: GlobalRateLimitGuard },
  ],
})
export class AppModule { }

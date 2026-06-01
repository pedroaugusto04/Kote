import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthService } from './application/auth.js';
import { IntegrationConnectionService } from './application/integration-connections.js';
import { IntegrationCredentialService } from './application/credentials.js';
import { ConversationAgentGateway } from './application/ports/conversation/conversation-agent.gateway.js'; 
import { GithubIntegrationGateway } from './application/ports/integrations/github-integration.port.js';
import { GoogleOAuthGateway } from './application/ports/auth/google-oauth.gateway.js';
import { ProjectBriefAiGateway } from './application/ports/projects/project-brief-ai.gateway.js';
import { NoteEmbeddingRepository } from './application/ports/notes/note-embedding.repository.js';
import { EmbeddingGateway } from './application/ports/notes/embedding.gateway.js';
import { AnswerGenerationGateway } from './application/ports/query/answer-generation.gateway.js';
import { EmbeddingQueuePublisher } from './application/ports/notes/embedding-queue.publisher.js';
import { ProjectBriefHistoryRepository } from './application/ports/projects/project-brief-history.repository.js';
import { AskHistoryRepository } from './application/ports/query/ask-history.repository.js';
import { ReminderDeliveryGateway } from './application/ports/reminders/reminder-delivery.gateway.js';
import { ReviewAnalysisGateway } from './application/ports/projects/review-analysis.port.js';
import { RuntimeEnvironmentProvider } from './application/ports/observability/runtime-environment.port.js';
import { ContentObjectStorageService } from './application/services/content-object-storage.service.js';
import { VapidService } from './application/services/vapid.service.js';
import { GithubRepositoryResolutionService } from './application/services/github-repository-resolution.service.js';
import { SchemaMigrator, UserRepository } from './application/ports/auth/auth.repository.js';
import { ContentQueryRepository, ContentRepository } from './application/ports/notes/content.repository.js';
import { ObjectStorage } from './application/ports/notes/object-storage.js'; 
import {
  CredentialRepository,
  ExternalIdentityRepository,
  IntegrationConnectionSessionRepository,
} from './application/ports/integrations/integrations.repository.js';
import { WebhookEventRepository } from './application/ports/webhooks/webhook-events.repository.js';
import { WebhookSubscriptionRepository } from './application/ports/webhooks/webhook-subscription.repository.js';
import { WebhookQueuePublisher } from './application/ports/webhooks/webhook-queue.publisher.js';
import { TelegramMessageSender } from './application/ports/integrations/telegram-message.sender.js';
import { WhatsappMediaDownloader } from './application/ports/integrations/whatsapp-media.downloader.js';
import { WhatsappReplySender } from './application/ports/integrations/whatsapp-reply.sender.js';
import { ConversationStateRepository, ReminderDispatchRepository } from './application/ports/reminders/workflow-state.repository.js';
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
import { PostgresWebhookSubscriptionRepository } from './infrastructure/repositories/webhook-subscription.repository.js';
import { PostgresWorkflowStateRepository } from './infrastructure/repositories/workflow-state.repository.js';
import { PushSubscriptionRepository } from './application/ports/push/push-subscription.repository.js';
import { PostgresPushSubscriptionRepository } from './infrastructure/repositories/push-subscription.repository.js';
import { ProcessRuntimeEnvironmentProvider } from './infrastructure/runtime/runtime-environment.provider.js';
import { SupabaseObjectStorage } from './infrastructure/storage/supabase-object-storage.js';
import { RabbitMqEmbeddingQueuePublisher } from './infrastructure/queue/rabbitmq-embedding-queue.publisher.js';
import { RabbitMqWebhookQueuePublisher } from './infrastructure/queue/rabbitmq-webhook-queue.publisher.js';
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
  ListProjectKnowledgeMapUseCase,
  ListProjectTimelineUseCase,
  MarkReminderAsSentUseCase,
  ProcessAgentConversationUseCase,
  QueryKnowledgeUseCase,
  AskKnowledgeUseCase,
  ResolveWhatsappAskAttachmentsUseCase,
  RunAskAiUseCase,
  ListAskHistoryUseCase,
  RefreshReminderStatusesUseCase,
  ListProjectFoldersUseCase,
  SetProjectFavoriteUseCase,
  UpdateNoteUseCase,
  UpdateReminderStatusUseCase,
  UpdateProjectFolderUseCase,
  UpdateProjectUseCase,
  ListWorkspacesUseCase,
  ListWorkspaceRepositoriesUseCase,
  ReindexAllEmbeddingsUseCase,
  LogApplicationAccessUseCase,
  ListWebhookSubscriptionsUseCase,
  CreateWebhookSubscriptionUseCase,
  UpdateWebhookSubscriptionUseCase,
  DeleteWebhookSubscriptionUseCase,
  ListPushSubscriptionsUseCase,
  CreatePushSubscriptionUseCase,
  DeletePushSubscriptionUseCase,
} from './application/use-cases/index.js';
import { NoteEventDispatcher } from './application/services/note-event-dispatcher.js';
import { WebhookDeliveryService } from './application/services/webhook-delivery.service.js';
import { WebhookDeliveryWorker } from './application/services/webhook-delivery.worker.js';
import { ReminderDispatchWorker } from './application/services/reminder-dispatch.worker.js';
import { EmbeddingWorker } from './application/services/embedding.worker.js';
import { NoteChunkingService } from './application/services/note-chunking.service.js';
import { ConversationAgentPresenter } from './application/use-cases/conversation/services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from './application/use-cases/conversation/services/conversation-folder-resolution.service.js';
import { ApplicationAccessController, AuthController, DashboardController, GithubAppCallbackController, HealthController, InternalIntegrationsController, InternalN8NController, NotesController, OperationsController, ProjectsController, UserIntegrationsController, WebhookController, WebhookSubscriptionsController, WorkspacesController, PushSubscriptionsController } from './interfaces/http/controllers/index.js';
import { AccessTokenAuthGuard, AuthRateLimitGuard, GlobalRateLimitGuard, InternalServiceTokenGuard, TrustedOriginGuard, WebhookRateLimitGuard } from './interfaces/http/auth.guards.js';
import { GlobalExceptionFilter } from './observability/global-exception.filter.js';
import { AppLogger } from './observability/logger.js';

@Module({
  controllers: [HealthController, ApplicationAccessController, DashboardController, WorkspacesController, ProjectsController, NotesController, AuthController, UserIntegrationsController, GithubAppCallbackController, InternalIntegrationsController, OperationsController, InternalN8NController, WebhookController, WebhookSubscriptionsController, PushSubscriptionsController],
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
    ListProjectKnowledgeMapUseCase,
    ListProjectTimelineUseCase,
    CreateProjectFolderUseCase,
    UpdateProjectFolderUseCase,
    DeleteProjectFolderUseCase,
    SetProjectFavoriteUseCase,
    CreateManualNoteUseCase,
    UpdateNoteUseCase,
    DeleteNoteUseCase,
    GetNoteAttachmentContentUseCase,
    ListWorkspaceRepositoriesUseCase,
    IntegrationConnectionService,
    IntegrationCredentialService,
    ContentObjectStorageService,
    VapidService,
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
    ListWebhookSubscriptionsUseCase,
    CreateWebhookSubscriptionUseCase,
    UpdateWebhookSubscriptionUseCase,
    DeleteWebhookSubscriptionUseCase,
    ListPushSubscriptionsUseCase,
    CreatePushSubscriptionUseCase,
    DeletePushSubscriptionUseCase,
    NoteEventDispatcher,
    WebhookDeliveryService,
    WebhookDeliveryWorker,
    AskKnowledgeUseCase,
    ResolveWhatsappAskAttachmentsUseCase,
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
    PostgresWebhookSubscriptionRepository,
    PostgresPushSubscriptionRepository,
    SupabaseObjectStorage,
    RabbitMqEmbeddingQueuePublisher,
    RabbitMqWebhookQueuePublisher,
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
    { provide: WebhookQueuePublisher, useExisting: RabbitMqWebhookQueuePublisher },
    { provide: EmbeddingGateway, useExisting: DefaultEmbeddingGateway },
    { provide: AnswerGenerationGateway, useExisting: DefaultAnswerGenerationGateway },
    { provide: ObjectStorage, useExisting: SupabaseObjectStorage },
    { provide: ConversationStateRepository, useExisting: PostgresWorkflowStateRepository },
    { provide: ReminderDispatchRepository, useExisting: PostgresWorkflowStateRepository },
    { provide: WebhookEventRepository, useExisting: PostgresWebhookEventRepository },
    { provide: WebhookSubscriptionRepository, useExisting: PostgresWebhookSubscriptionRepository },
    { provide: PushSubscriptionRepository, useExisting: PostgresPushSubscriptionRepository },
    { provide: WhatsappReplySender, useExisting: EvolutionWhatsappReplySender },
    { provide: WhatsappMediaDownloader, useExisting: EvolutionWhatsappMediaDownloader },
    { provide: TelegramMessageSender, useExisting: TelegramHttpMessageSender },
    { provide: ReminderDeliveryGateway, useExisting: EvolutionReminderDeliveryGateway },
    { provide: APP_GUARD, useClass: GlobalRateLimitGuard },
  ],
})
export class AppModule { }

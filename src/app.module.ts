import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthService } from './application/auth.js';
import { IntegrationCredentialService } from './application/credentials.js';
import { KnowledgeStore } from './application/knowledge-store.js';
import {
  ContentQueryRepository,
  ContentRepository,
  ConversationStateRepository,
  CredentialRepository,
  ExternalIdentityRepository,
  ReminderDispatchRepository,
  SchemaMigrator,
  UserRepository,
  WebhookEventRepository,
} from './application/ports/repositories.js';
import { PostgresKnowledgeStore } from './infrastructure/repositories/postgres-knowledge.store.js';
import { PostgresContentQueryRepository } from './infrastructure/repositories/postgres-content.repository.js';
import {
  BuildDashboardUseCase,
  BuildReminderDispatchUseCase,
  GetNoteDetailUseCase,
  HandleGithubPushUseCase,
  HandleWhatsappWebhookUseCase,
  IngestEntryUseCase,
  MarkReminderAsSentUseCase,
  ProcessConversationUseCase,
  QueryKnowledgeUseCase,
  RunOnboardingUseCase,
} from './application/use-cases/index.js';
import { AuthController, DashboardController, HealthController, InternalIntegrationsController, InternalN8nController, OperationsController, UserIntegrationsController, WebhookController } from './interfaces/http/controllers/index.js';
import { AccessTokenAuthGuard, AuthRateLimitGuard, GlobalRateLimitGuard, InternalServiceTokenGuard, TrustedOriginGuard, WebhookRateLimitGuard } from './interfaces/http/auth.guards.js';

@Module({
  controllers: [HealthController, DashboardController, AuthController, UserIntegrationsController, InternalIntegrationsController, OperationsController, InternalN8nController, WebhookController],
  providers: [
    AuthService,
    AccessTokenAuthGuard,
    AuthRateLimitGuard,
    GlobalRateLimitGuard,
    TrustedOriginGuard,
    InternalServiceTokenGuard,
    WebhookRateLimitGuard,
    BuildDashboardUseCase,
    IntegrationCredentialService,
    GetNoteDetailUseCase,
    QueryKnowledgeUseCase,
    IngestEntryUseCase,
    RunOnboardingUseCase,
    ProcessConversationUseCase,
    BuildReminderDispatchUseCase,
    MarkReminderAsSentUseCase,
    HandleGithubPushUseCase,
    HandleWhatsappWebhookUseCase,
    { provide: KnowledgeStore, useClass: PostgresKnowledgeStore },
    { provide: SchemaMigrator, useExisting: KnowledgeStore },
    { provide: UserRepository, useExisting: KnowledgeStore },
    { provide: CredentialRepository, useExisting: KnowledgeStore },
    { provide: ExternalIdentityRepository, useExisting: KnowledgeStore },
    { provide: ContentRepository, useExisting: KnowledgeStore },
    { provide: WebhookEventRepository, useExisting: KnowledgeStore },
    { provide: ConversationStateRepository, useExisting: KnowledgeStore },
    { provide: ReminderDispatchRepository, useExisting: KnowledgeStore },
    { provide: ContentQueryRepository, useClass: PostgresContentQueryRepository },
    { provide: APP_GUARD, useClass: GlobalRateLimitGuard },
  ],
})
export class AppModule {}

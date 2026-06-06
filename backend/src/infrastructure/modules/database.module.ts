import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { StorageModule } from './storage.module.js';

import { SchemaMigrator, UserRepository } from '../../application/ports/auth/auth.repository.js';
import { ContentQueryRepository, ContentRepository } from '../../application/ports/notes/content.repository.js';
import {
  CredentialRepository,
  ExternalIdentityRepository,
  IntegrationConnectionSessionRepository,
} from '../../application/ports/integrations/integrations.repository.js';
import { WebhookEventRepository } from '../../application/ports/webhooks/webhook-events.repository.js';
import { WebhookSubscriptionRepository } from '../../application/ports/webhooks/webhook-subscription.repository.js';
import { ConversationStateRepository, ReminderDispatchRepository } from '../../application/ports/reminders/workflow-state.repository.js';
import { PushSubscriptionRepository } from '../../application/ports/push/push-subscription.repository.js';
import { ProjectBriefHistoryRepository } from '../../application/ports/projects/project-brief-history.repository.js';
import { AskHistoryRepository } from '../../application/ports/query/ask-history.repository.js';
import { NoteEmbeddingRepository } from '../../application/ports/notes/note-embedding.repository.js';

import { PostgresUserRepository } from '../repositories/auth.repository.js';
import { PostgresContentQueryRepository } from '../repositories/content-query.repository.js';
import { PostgresContentRepository } from '../repositories/content.repository.js';
import { PostgresDatabase } from '../persistence/database.js';
import { PostgresIntegrationRepository } from '../repositories/integrations.repository.js';
import { PostgresNoteEmbeddingRepository } from '../repositories/note-embedding.repository.js';
import { PostgresProjectBriefHistoryRepository } from '../repositories/project-brief-history.repository.js';
import { PostgresAskHistoryRepository } from '../repositories/ask-history.repository.js';
import { PostgresSchemaMigrator } from '../persistence/schema.migrator.js';
import { PostgresWebhookEventRepository } from '../repositories/webhook-events.repository.js';
import { PostgresWebhookSubscriptionRepository } from '../repositories/webhook-subscription.repository.js';
import { PostgresWorkflowStateRepository } from '../repositories/workflow-state.repository.js';
import { PostgresPushSubscriptionRepository } from '../repositories/push-subscription.repository.js';

const repositories = [
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
  { provide: SchemaMigrator, useExisting: PostgresSchemaMigrator },
  { provide: UserRepository, useExisting: PostgresUserRepository },
  { provide: ProjectBriefHistoryRepository, useExisting: PostgresProjectBriefHistoryRepository },
  { provide: AskHistoryRepository, useExisting: PostgresAskHistoryRepository },
  { provide: CredentialRepository, useExisting: PostgresIntegrationRepository },
  { provide: ExternalIdentityRepository, useExisting: PostgresIntegrationRepository },
  { provide: IntegrationConnectionSessionRepository, useExisting: PostgresIntegrationRepository },
  { provide: ContentRepository, useExisting: PostgresContentRepository },
  { provide: ContentQueryRepository, useExisting: PostgresContentQueryRepository },
  { provide: NoteEmbeddingRepository, useExisting: PostgresNoteEmbeddingRepository },
  { provide: ConversationStateRepository, useExisting: PostgresWorkflowStateRepository },
  { provide: ReminderDispatchRepository, useExisting: PostgresWorkflowStateRepository },
  { provide: WebhookEventRepository, useExisting: PostgresWebhookEventRepository },
  { provide: WebhookSubscriptionRepository, useExisting: PostgresWebhookSubscriptionRepository },
  { provide: PushSubscriptionRepository, useExisting: PostgresPushSubscriptionRepository },
];

@Module({
  imports: [LoggerModule, StorageModule],
  providers: repositories,
  exports: repositories,
})
export class DatabaseModule {}

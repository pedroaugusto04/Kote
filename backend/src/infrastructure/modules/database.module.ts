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
import { QuotaRepository } from '../../application/ports/quota/quota.repository.js';
import { QuotaService } from '../../application/services/quota.service.js';
import {
  BillingCustomerRepository,
  BillingPaymentRepository,
  BillingWebhookEventRepository,
} from '../../application/ports/billing/billing-repositories.js';

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
import { PostgresWorkspaceRepository } from '../repositories/workspace.repository.js';
import { PostgresProjectRepository } from '../repositories/project.repository.js';
import { PostgresNoteRepository } from '../repositories/note.repository.js';
import { PostgresFolderRepository } from '../repositories/folder.repository.js';
import { PostgresAttachmentRepository } from '../repositories/attachment.repository.js';
import { PostgresCategoryRepository } from '../repositories/category.repository.js';
import { PostgresQuotaRepository } from '../repositories/quota.repository.js';
import {
  PostgresBillingCustomerRepository,
  PostgresBillingPaymentRepository,
  PostgresBillingWebhookEventRepository,
} from '../repositories/billing.repository.js';

const repositories = [
  PostgresDatabase,
  PostgresSchemaMigrator,
  PostgresUserRepository,
  PostgresIntegrationRepository,
  PostgresProjectBriefHistoryRepository,
  PostgresAskHistoryRepository,
  PostgresWorkspaceRepository,
  PostgresProjectRepository,
  PostgresNoteRepository,
  PostgresFolderRepository,
  PostgresAttachmentRepository,
  PostgresCategoryRepository,
  PostgresContentRepository,
  PostgresContentQueryRepository,
  PostgresNoteEmbeddingRepository,
  PostgresWorkflowStateRepository,
  PostgresWebhookEventRepository,
  PostgresWebhookSubscriptionRepository,
  PostgresPushSubscriptionRepository,
  PostgresQuotaRepository,
  PostgresBillingCustomerRepository,
  PostgresBillingPaymentRepository,
  PostgresBillingWebhookEventRepository,
  { provide: SchemaMigrator, useExisting: PostgresSchemaMigrator },
  { provide: QuotaRepository, useExisting: PostgresQuotaRepository },
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
  { provide: BillingCustomerRepository, useExisting: PostgresBillingCustomerRepository },
  { provide: BillingPaymentRepository, useExisting: PostgresBillingPaymentRepository },
  { provide: BillingWebhookEventRepository, useExisting: PostgresBillingWebhookEventRepository },
];

@Module({
  imports: [LoggerModule, StorageModule],
  providers: repositories,
  exports: repositories,
})
export class DatabaseModule {}

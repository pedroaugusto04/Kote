import type { ReminderDispatchMode } from '../../contracts/enums.js';
import type { ReminderView } from '../models/reminder.models.js';
import type {
  ExternalIdentityRecord,
  IntegrationCredentialRecord,
  KbUser,
  NoteRecord,
  SaveAttachmentInput,
  SaveNoteInput,
  SaveProjectInput,
  SaveWorkspaceInput,
  AttachmentRecord,
  ConversationStateRecord,
  WebhookEventRecord,
  WebhookEventStatus,
} from '../models/repository-records.models.js';
import type { ReviewView } from '../models/review.models.js';
import type { VaultNoteDetail, VaultNoteSummary } from '../models/vault-note.models.js';

export abstract class SchemaMigrator {
  abstract migrate(): Promise<void>;
}

export abstract class UserRepository {
  abstract findUserByEmail(email: string): Promise<KbUser | null>;
  abstract findUserById(id: string): Promise<KbUser | null>;
  abstract createUser(input: { email: string; displayName?: string; passwordHash: string; role: string }): Promise<KbUser>;
}

export abstract class CredentialRepository {
  abstract listCredentials(userId: string, workspaceSlug: string): Promise<IntegrationCredentialRecord[]>;
  abstract upsertCredential(
    input: Pick<IntegrationCredentialRecord, 'userId' | 'workspaceSlug' | 'provider' | 'status' | 'encryptedConfig' | 'publicMetadata'>,
  ): Promise<IntegrationCredentialRecord>;
  abstract revokeCredential(userId: string, workspaceSlug: string, provider: string, encryptedConfig: unknown): Promise<IntegrationCredentialRecord | null>;
  abstract findCredential(userId: string, workspaceSlug: string, provider: string): Promise<IntegrationCredentialRecord | null>;
}

export abstract class ExternalIdentityRepository {
  abstract findExternalIdentity(provider: string, identityType: string, externalId: string): Promise<ExternalIdentityRecord | null>;
  abstract upsertExternalIdentity(input: {
    userId: string;
    workspaceSlug: string;
    provider: string;
    identityType: string;
    externalId: string;
    credentialId?: string | null;
    verifiedAt?: string | null;
    metadata?: Record<string, unknown>;
    publicMetadata: Record<string, unknown>;
  }): Promise<ExternalIdentityRecord>;
}

export abstract class ContentRepository {
  abstract listWorkspaces(userId: string): Promise<SaveWorkspaceInput[]>;
  abstract upsertWorkspace(userId: string, input: SaveWorkspaceInput): Promise<SaveWorkspaceInput>;
  abstract listProjects(userId: string): Promise<SaveProjectInput[]>;
  abstract upsertProject(userId: string, input: SaveProjectInput): Promise<SaveProjectInput>;
  abstract listNotes(userId: string): Promise<NoteRecord[]>;
  abstract getNoteById(userId: string, id: string): Promise<NoteRecord | null>;
  abstract upsertNote(userId: string, input: SaveNoteInput): Promise<NoteRecord>;
  abstract saveAttachment(userId: string, input: SaveAttachmentInput): Promise<AttachmentRecord>;
  abstract listAttachments(userId: string, noteId: string): Promise<AttachmentRecord[]>;
}

export abstract class ContentQueryRepository {
  abstract list(userId: string): Promise<VaultNoteSummary[]>;
  abstract getById(userId: string, id: string): Promise<VaultNoteDetail | null>;
  abstract listReviews(userId: string): Promise<ReviewView[]>;
  abstract listReminders(userId: string): Promise<ReminderView[]>;
}

export abstract class WebhookEventRepository {
  abstract recordWebhookEvent(input: {
    provider: string;
    eventType: string;
    status: WebhookEventStatus;
    resolvedUserId?: string | null;
    externalIdentity?: Record<string, unknown>;
    rawHeaders?: Record<string, unknown>;
    rawPayload?: unknown;
    error?: string;
  }): Promise<WebhookEventRecord>;
}

export abstract class ConversationStateRepository {
  abstract get(userId: string, workspaceSlug: string, conversationKey: string): Promise<ConversationStateRecord | null>;
  abstract upsert(userId: string, workspaceSlug: string, conversationKey: string, state: unknown): Promise<ConversationStateRecord>;
  abstract clear(userId: string, workspaceSlug: string, conversationKey: string): Promise<void>;
}

export abstract class ReminderDispatchRepository {
  abstract hasSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string): Promise<boolean>;
  abstract markSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string): Promise<void>;
}

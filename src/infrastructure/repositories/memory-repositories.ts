import crypto from 'node:crypto';

import { CredentialRecordStatus, type ReminderDispatchMode } from '../../contracts/enums.js';
import type {
  AttachmentRecord,
  ConversationStateRecord,
  ExternalIdentityRecord,
  IntegrationCredentialRecord,
  KbUser,
  NoteRecord,
  ProjectRecord,
  SaveAttachmentInput,
  SaveNoteInput,
  SaveProjectInput,
  SaveWorkspaceInput,
  WebhookEventRecord,
  WebhookEventStatus,
  WorkspaceRecord,
} from '../../application/models/repository-records.models.js';
import { SchemaMigrator, UserRepository } from '../../application/ports/auth.repository.js';
import { ContentQueryRepository, ContentRepository } from '../../application/ports/content.repository.js';
import { CredentialRepository, ExternalIdentityRepository } from '../../application/ports/integrations.repository.js';
import { WebhookEventRepository } from '../../application/ports/webhook-events.repository.js';
import { ConversationStateRepository, ReminderDispatchRepository } from '../../application/ports/workflow-state.repository.js';
import { noteDetail, noteSummary, reminderFromNote, reviewFromNote } from './content-query.mappers.js';

export type MemoryRepositoryState = {
  users: Map<string, KbUser>;
  credentials: Map<string, IntegrationCredentialRecord>;
  identities: Map<string, ExternalIdentityRecord>;
  workspaces: Map<string, WorkspaceRecord>;
  projects: Map<string, ProjectRecord>;
  notes: Map<string, NoteRecord>;
  attachments: Map<string, AttachmentRecord>;
  webhookEvents: Map<string, WebhookEventRecord>;
  conversationStates: Map<string, ConversationStateRecord>;
  reminderDispatch: Set<string>;
};

function createMemoryRepositoryState(): MemoryRepositoryState {
  return {
    users: new Map(),
    credentials: new Map(),
    identities: new Map(),
    workspaces: new Map(),
    projects: new Map(),
    notes: new Map(),
    attachments: new Map(),
    webhookEvents: new Map(),
    conversationStates: new Map(),
    reminderDispatch: new Set(),
  };
}

function credentialKey(userId: string, workspaceSlug: string, provider: string) {
  return `${userId}:${workspaceSlug}:${provider}`;
}

function identityKey(provider: string, identityType: string, externalId: string) {
  return `${provider}:${identityType}:${externalId}`;
}

function conversationStateKey(userId: string, workspaceSlug: string, conversationKey: string) {
  return `${userId}:${workspaceSlug}:${conversationKey}`;
}

function reminderDispatchKey(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
  return `${userId}:${workspaceSlug}:${mode}:${dispatchKey}:${reminderId}`;
}

export class MemorySchemaMigrator extends SchemaMigrator {
  async migrate() {}
}

export class MemoryUserRepository extends UserRepository {
  constructor(private readonly state: MemoryRepositoryState) {
    super();
  }

  async findUserByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    return Array.from(this.state.users.values()).find((user) => user.email === normalized) || null;
  }

  async findUserById(id: string) {
    return this.state.users.get(id) || null;
  }

  async createUser(input: { email: string; displayName?: string; passwordHash: string; role: string }) {
    const now = new Date().toISOString();
    const user: KbUser = {
      id: crypto.randomUUID(),
      email: input.email.trim().toLowerCase(),
      displayName: String(input.displayName || input.email.split('@')[0] || 'User').trim(),
      passwordHash: input.passwordHash,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    };
    this.state.users.set(user.id, user);
    return user;
  }
}

export class MemoryIntegrationRepository extends CredentialRepository implements ExternalIdentityRepository {
  constructor(private readonly state: MemoryRepositoryState) {
    super();
  }

  async listCredentials(userId: string, workspaceSlug: string) {
    return Array.from(this.state.credentials.values()).filter((credential) => credential.userId === userId && credential.workspaceSlug === workspaceSlug);
  }

  async upsertCredential(input: Pick<IntegrationCredentialRecord, 'userId' | 'workspaceSlug' | 'provider' | 'status' | 'encryptedConfig' | 'publicMetadata'>) {
    const key = credentialKey(input.userId, input.workspaceSlug, input.provider);
    const existing = this.state.credentials.get(key);
    const now = new Date().toISOString();
    const credential: IntegrationCredentialRecord = {
      id: existing?.id || crypto.randomUUID(),
      userId: input.userId,
      workspaceSlug: input.workspaceSlug,
      provider: input.provider,
      status: input.status,
      encryptedConfig: input.encryptedConfig,
      publicMetadata: input.publicMetadata,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      revokedAt: null,
    };
    this.state.credentials.set(key, credential);
    return credential;
  }

  async revokeCredential(userId: string, workspaceSlug: string, provider: string, encryptedConfig: unknown) {
    const key = credentialKey(userId, workspaceSlug, provider);
    const existing = this.state.credentials.get(key);
    if (!existing) return null;
    const now = new Date().toISOString();
    const revoked = { ...existing, status: CredentialRecordStatus.Revoked, encryptedConfig, updatedAt: now, revokedAt: now };
    this.state.credentials.set(key, revoked);
    return revoked;
  }

  async findCredential(userId: string, workspaceSlug: string, provider: string) {
    return this.state.credentials.get(credentialKey(userId, workspaceSlug, provider)) || null;
  }

  async findExternalIdentity(provider: string, identityType: string, externalId: string) {
    return this.state.identities.get(identityKey(provider, identityType, externalId)) || null;
  }

  async upsertExternalIdentity(input: {
    userId: string;
    workspaceSlug: string;
    provider: string;
    identityType: string;
    externalId: string;
    credentialId?: string | null;
    verifiedAt?: string | null;
    metadata?: Record<string, unknown>;
    publicMetadata: Record<string, unknown>;
  }) {
    const key = identityKey(input.provider, input.identityType, input.externalId);
    const existing = this.state.identities.get(key);
    const now = new Date().toISOString();
    const identity: ExternalIdentityRecord = {
      id: existing?.id || crypto.randomUUID(),
      userId: input.userId,
      workspaceSlug: input.workspaceSlug,
      provider: input.provider,
      identityType: input.identityType,
      externalId: input.externalId,
      credentialId: input.credentialId || existing?.credentialId || null,
      verifiedAt: input.verifiedAt || existing?.verifiedAt || now,
      metadata: input.metadata || existing?.metadata || {},
      publicMetadata: input.publicMetadata,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.state.identities.set(key, identity);
    return identity;
  }
}

export class MemoryContentRepository extends ContentRepository {
  constructor(private readonly state: MemoryRepositoryState) {
    super();
  }

  async listWorkspaces(userId: string) {
    return Array.from(this.state.workspaces.entries())
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, workspace]) => workspace);
  }

  async upsertWorkspace(userId: string, input: SaveWorkspaceInput) {
    const key = `${userId}:${input.workspaceSlug}`;
    const existing = this.state.workspaces.get(key);
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      ...input,
      createdAt: existing?.createdAt || input.createdAt || now,
      updatedAt: now,
    };
    this.state.workspaces.set(key, workspace);
    return workspace;
  }

  async listProjects(userId: string) {
    return Array.from(this.state.projects.entries())
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, project]) => project);
  }

  async upsertProject(userId: string, input: SaveProjectInput) {
    const project: ProjectRecord = { ...input };
    this.state.projects.set(`${userId}:${project.projectSlug}`, project);
    return project;
  }

  async listNotes(userId: string) {
    return Array.from(this.state.notes.entries())
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, note]) => note);
  }

  async getNoteById(userId: string, id: string) {
    return this.state.notes.get(`${userId}:${id}`) || null;
  }

  async upsertNote(userId: string, input: SaveNoteInput) {
    const id = input.id || crypto.randomUUID();
    const note: NoteRecord = { ...input, id };
    this.state.notes.set(`${userId}:${id}`, note);
    return note;
  }

  async saveAttachment(userId: string, input: SaveAttachmentInput) {
    const now = new Date().toISOString();
    const attachment: AttachmentRecord = {
      id: input.id || crypto.randomUUID(),
      userId,
      noteId: input.noteId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      contentBase64: input.contentBase64,
      checksumSha256: input.checksumSha256,
      metadata: input.metadata,
      createdAt: now,
    };
    this.state.attachments.set(`${userId}:${attachment.noteId}:${attachment.id}`, attachment);
    return attachment;
  }

  async listAttachments(userId: string, noteId: string) {
    return Array.from(this.state.attachments.values()).filter((attachment) => attachment.userId === userId && attachment.noteId === noteId);
  }
}

export class MemoryContentQueryRepository extends ContentQueryRepository {
  constructor(private readonly state: MemoryRepositoryState) {
    super();
  }

  private notesForUser(userId: string) {
    return Array.from(this.state.notes.entries())
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, note]) => note)
      .sort((left, right) => {
        const occurredAtComparison = right.occurredAt.localeCompare(left.occurredAt);
        if (occurredAtComparison !== 0) return occurredAtComparison;
        return left.title.localeCompare(right.title);
      });
  }

  async list(userId: string) {
    return this.notesForUser(userId).map(noteSummary);
  }

  async getById(userId: string, id: string) {
    const note = this.state.notes.get(`${userId}:${id}`) || null;
    return note ? noteDetail(note) : null;
  }

  async listReviews(userId: string) {
    return this.notesForUser(userId).map(reviewFromNote).filter((review): review is NonNullable<typeof review> => Boolean(review));
  }

  async listReminders(userId: string) {
    return this.notesForUser(userId).map(reminderFromNote).filter((reminder): reminder is NonNullable<typeof reminder> => Boolean(reminder));
  }
}

export class MemoryWorkflowStateRepository extends ConversationStateRepository implements ReminderDispatchRepository {
  constructor(private readonly state: MemoryRepositoryState) {
    super();
  }

  async get(userId: string, workspaceSlug: string, conversationKey: string) {
    return this.state.conversationStates.get(conversationStateKey(userId, workspaceSlug, conversationKey)) || null;
  }

  async upsert(userId: string, workspaceSlug: string, conversationKey: string, state: unknown) {
    const record: ConversationStateRecord = {
      userId,
      workspaceSlug,
      conversationKey,
      state,
      updatedAt: new Date().toISOString(),
    };
    this.state.conversationStates.set(conversationStateKey(userId, workspaceSlug, conversationKey), record);
    return record;
  }

  async clear(userId: string, workspaceSlug: string, conversationKey: string) {
    this.state.conversationStates.delete(conversationStateKey(userId, workspaceSlug, conversationKey));
  }

  async hasSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
    return this.state.reminderDispatch.has(reminderDispatchKey(userId, workspaceSlug, mode, dispatchKey, reminderId));
  }

  async markSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
    this.state.reminderDispatch.add(reminderDispatchKey(userId, workspaceSlug, mode, dispatchKey, reminderId));
  }
}

export class MemoryWebhookEventRepository extends WebhookEventRepository {
  constructor(private readonly state: MemoryRepositoryState) {
    super();
  }

  async recordWebhookEvent(input: {
    provider: string;
    eventType: string;
    status: WebhookEventStatus;
    resolvedUserId?: string | null;
    externalIdentity?: Record<string, unknown>;
    rawHeaders?: Record<string, unknown>;
    rawPayload?: unknown;
    error?: string;
  }) {
    const now = new Date().toISOString();
    const event: WebhookEventRecord = {
      id: crypto.randomUUID(),
      provider: input.provider,
      eventType: input.eventType,
      status: input.status,
      resolvedUserId: input.resolvedUserId || null,
      externalIdentity: input.externalIdentity || {},
      rawHeaders: input.rawHeaders || {},
      rawPayload: input.rawPayload || {},
      error: input.error || '',
      createdAt: now,
      updatedAt: now,
    };
    this.state.webhookEvents.set(event.id, event);
    return event;
  }
}

export function createMemoryRepositories(state = createMemoryRepositoryState()) {
  const schemaMigrator = new MemorySchemaMigrator();
  const userRepository = new MemoryUserRepository(state);
  const integrationRepository = new MemoryIntegrationRepository(state);
  const contentRepository = new MemoryContentRepository(state);
  const contentQueryRepository = new MemoryContentQueryRepository(state);
  const workflowStateRepository = new MemoryWorkflowStateRepository(state);
  const webhookEventRepository = new MemoryWebhookEventRepository(state);

  return {
    state,
    schemaMigrator,
    userRepository,
    credentialRepository: integrationRepository,
    externalIdentityRepository: integrationRepository,
    contentRepository,
    contentQueryRepository,
    conversationStateRepository: workflowStateRepository,
    reminderDispatchRepository: workflowStateRepository,
    webhookEventRepository,
  };
}

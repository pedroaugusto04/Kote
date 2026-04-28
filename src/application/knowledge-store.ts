import crypto from 'node:crypto';

import { CredentialRecordStatus, type ReminderDispatchMode } from '../contracts/enums.js';
import type {
  ExternalIdentityRecord,
  IntegrationCredentialRecord,
  KbUser,
  NoteRecord,
  AttachmentRecord,
  ConversationStateRecord,
  SaveAttachmentInput,
  ProjectRecord,
  SaveNoteInput,
  SaveProjectInput,
  SaveWorkspaceInput,
  WebhookEventRecord,
  WebhookEventStatus,
  WorkspaceRecord,
} from './models/repository-records.models.js';
import type {
  ContentRepository,
  ConversationStateRepository,
  CredentialRepository,
  ExternalIdentityRepository,
  ReminderDispatchRepository,
  SchemaMigrator,
  UserRepository,
  WebhookEventRepository,
} from './ports/repositories.js';

export abstract class KnowledgeStore
  implements SchemaMigrator, UserRepository, CredentialRepository, ExternalIdentityRepository, ContentRepository, WebhookEventRepository, ConversationStateRepository, ReminderDispatchRepository
{
  abstract migrate(): Promise<void>;
  abstract findUserByEmail(email: string): Promise<KbUser | null>;
  abstract findUserById(id: string): Promise<KbUser | null>;
  abstract createUser(input: { email: string; displayName?: string; passwordHash: string; role: string }): Promise<KbUser>;
  abstract listCredentials(userId: string, workspaceSlug: string): Promise<IntegrationCredentialRecord[]>;
  abstract upsertCredential(
    input: Pick<IntegrationCredentialRecord, 'userId' | 'workspaceSlug' | 'provider' | 'status' | 'encryptedConfig' | 'publicMetadata'>,
  ): Promise<IntegrationCredentialRecord>;
  abstract revokeCredential(userId: string, workspaceSlug: string, provider: string, encryptedConfig: unknown): Promise<IntegrationCredentialRecord | null>;
  abstract findCredential(userId: string, workspaceSlug: string, provider: string): Promise<IntegrationCredentialRecord | null>;
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
  abstract listWorkspaces(userId: string): Promise<WorkspaceRecord[]>;
  abstract upsertWorkspace(userId: string, input: SaveWorkspaceInput): Promise<WorkspaceRecord>;
  abstract listProjects(userId: string): Promise<ProjectRecord[]>;
  abstract upsertProject(userId: string, input: SaveProjectInput): Promise<ProjectRecord>;
  abstract listNotes(userId: string): Promise<NoteRecord[]>;
  abstract getNoteById(userId: string, id: string): Promise<NoteRecord | null>;
  abstract upsertNote(userId: string, input: SaveNoteInput): Promise<NoteRecord>;
  abstract saveAttachment(userId: string, input: SaveAttachmentInput): Promise<AttachmentRecord>;
  abstract listAttachments(userId: string, noteId: string): Promise<AttachmentRecord[]>;
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
  abstract get(userId: string, workspaceSlug: string, conversationKey: string): Promise<ConversationStateRecord | null>;
  abstract upsert(userId: string, workspaceSlug: string, conversationKey: string, state: unknown): Promise<ConversationStateRecord>;
  abstract clear(userId: string, workspaceSlug: string, conversationKey: string): Promise<void>;
  abstract hasSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string): Promise<boolean>;
  abstract markSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string): Promise<void>;
}

export class MemoryKnowledgeStore extends KnowledgeStore {
  private users = new Map<string, KbUser>();
  private credentials = new Map<string, IntegrationCredentialRecord>();
  private identities = new Map<string, ExternalIdentityRecord>();
  private workspaces = new Map<string, WorkspaceRecord>();
  private projects = new Map<string, ProjectRecord>();
  private notes = new Map<string, NoteRecord>();
  private attachments = new Map<string, AttachmentRecord>();
  private webhookEvents = new Map<string, WebhookEventRecord>();
  private conversationStates = new Map<string, ConversationStateRecord>();
  private reminderDispatch = new Set<string>();

  async migrate() {}

  async findUserByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    return Array.from(this.users.values()).find((user) => user.email === normalized) || null;
  }

  async findUserById(id: string) {
    return this.users.get(id) || null;
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
    this.users.set(user.id, user);
    return user;
  }

  async listCredentials(userId: string, workspaceSlug: string) {
    return Array.from(this.credentials.values()).filter((credential) => credential.userId === userId && credential.workspaceSlug === workspaceSlug);
  }

  async upsertCredential(input: Pick<IntegrationCredentialRecord, 'userId' | 'workspaceSlug' | 'provider' | 'status' | 'encryptedConfig' | 'publicMetadata'>) {
    const key = credentialKey(input.userId, input.workspaceSlug, input.provider);
    const existing = this.credentials.get(key);
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
    this.credentials.set(key, credential);
    return credential;
  }

  async revokeCredential(userId: string, workspaceSlug: string, provider: string, encryptedConfig: unknown) {
    const key = credentialKey(userId, workspaceSlug, provider);
    const existing = this.credentials.get(key);
    if (!existing) return null;
    const revoked = { ...existing, status: CredentialRecordStatus.Revoked, encryptedConfig, updatedAt: new Date().toISOString(), revokedAt: new Date().toISOString() };
    this.credentials.set(key, revoked);
    return revoked;
  }

  async findCredential(userId: string, workspaceSlug: string, provider: string) {
    return this.credentials.get(credentialKey(userId, workspaceSlug, provider)) || null;
  }

  async findExternalIdentity(provider: string, identityType: string, externalId: string) {
    return this.identities.get(identityKey(provider, identityType, externalId)) || null;
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
    const existing = this.identities.get(key);
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
    this.identities.set(key, identity);
    return identity;
  }

  async listWorkspaces(userId: string) {
    return Array.from(this.workspaces.entries())
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, workspace]) => workspace);
  }

  async upsertWorkspace(userId: string, input: SaveWorkspaceInput) {
    const key = `${userId}:${input.workspaceSlug}`;
    const existing = this.workspaces.get(key);
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      ...input,
      createdAt: existing?.createdAt || input.createdAt || now,
      updatedAt: now,
    };
    this.workspaces.set(key, workspace);
    return workspace;
  }

  async listProjects(userId: string) {
    return Array.from(this.projects.entries())
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, project]) => project);
  }

  async upsertProject(userId: string, input: SaveProjectInput) {
    const project: ProjectRecord = { ...input };
    this.projects.set(`${userId}:${project.projectSlug}`, project);
    return project;
  }

  async listNotes(userId: string) {
    return Array.from(this.notes.entries())
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, note]) => note);
  }

  async getNoteById(userId: string, id: string) {
    return this.notes.get(`${userId}:${id}`) || null;
  }

  async upsertNote(userId: string, input: SaveNoteInput) {
    const id = input.id || crypto.randomUUID();
    const note: NoteRecord = { ...input, id };
    this.notes.set(`${userId}:${id}`, note);
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
    this.attachments.set(`${userId}:${attachment.noteId}:${attachment.id}`, attachment);
    return attachment;
  }

  async listAttachments(userId: string, noteId: string) {
    return Array.from(this.attachments.values()).filter((attachment) => attachment.userId === userId && attachment.noteId === noteId);
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
    this.webhookEvents.set(event.id, event);
    return event;
  }

  async get(userId: string, workspaceSlug: string, conversationKey: string) {
    return this.conversationStates.get(stateKey(userId, workspaceSlug, conversationKey)) || null;
  }

  async upsert(userId: string, workspaceSlug: string, conversationKey: string, state: unknown) {
    const record: ConversationStateRecord = {
      userId,
      workspaceSlug,
      conversationKey,
      state,
      updatedAt: new Date().toISOString(),
    };
    this.conversationStates.set(stateKey(userId, workspaceSlug, conversationKey), record);
    return record;
  }

  async clear(userId: string, workspaceSlug: string, conversationKey: string) {
    this.conversationStates.delete(stateKey(userId, workspaceSlug, conversationKey));
  }

  async hasSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
    return this.reminderDispatch.has(dispatchKeyForReminder(userId, workspaceSlug, mode, dispatchKey, reminderId));
  }

  async markSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
    this.reminderDispatch.add(dispatchKeyForReminder(userId, workspaceSlug, mode, dispatchKey, reminderId));
  }
}

function credentialKey(userId: string, workspaceSlug: string, provider: string): string {
  return `${userId}:${workspaceSlug}:${provider}`;
}

function identityKey(provider: string, identityType: string, externalId: string): string {
  return `${provider}:${identityType}:${externalId}`;
}

function stateKey(userId: string, workspaceSlug: string, conversationKey: string): string {
  return `${userId}:${workspaceSlug}:${conversationKey}`;
}

function dispatchKeyForReminder(userId: string, workspaceSlug: string, mode: string, dispatchKey: string, reminderId: string): string {
  return `${userId}:${workspaceSlug}:${mode}:${dispatchKey}:${reminderId}`;
}

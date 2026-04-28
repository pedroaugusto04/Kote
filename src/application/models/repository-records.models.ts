import type { CredentialRecordStatus, WebhookEventStatus } from '../../contracts/enums.js';

export type { WebhookEventStatus };

export type KbUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationCredentialRecord = {
  id: string;
  userId: string;
  workspaceSlug: string;
  provider: string;
  status: CredentialRecordStatus;
  encryptedConfig: unknown;
  publicMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type ExternalIdentityRecord = {
  id: string;
  userId: string;
  workspaceSlug: string;
  provider: string;
  identityType: string;
  externalId: string;
  credentialId: string | null;
  verifiedAt: string | null;
  metadata: Record<string, unknown>;
  publicMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceRecord = {
  workspaceSlug: string;
  displayName: string;
  whatsappGroupJid: string;
  telegramChatId: string;
  githubRepos: string[];
  projectSlugs: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  projectSlug: string;
  displayName: string;
  repoFullName: string;
  workspaceSlug: string;
  aliases: string[];
  defaultTags: string[];
  enabled: boolean;
};

export type NoteRecord = {
  id: string;
  path: string;
  type: string;
  title: string;
  projectSlug: string;
  workspaceSlug: string;
  status: string;
  tags: string[];
  occurredAt: string;
  sourceChannel: string;
  summary: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
  metadata: Record<string, unknown>;
  origin: string;
  source: string;
  links: string[];
};

export type AttachmentRecord = {
  id: string;
  userId: string;
  noteId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentBase64: string;
  checksumSha256: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ConversationStateRecord = {
  userId: string;
  workspaceSlug: string;
  conversationKey: string;
  state: unknown;
  updatedAt: string;
};

export type SaveProjectInput = ProjectRecord;

export type SaveWorkspaceInput = WorkspaceRecord;

export type SaveNoteInput = Omit<NoteRecord, 'id'> & { id?: string };

export type SaveAttachmentInput = Omit<AttachmentRecord, 'id' | 'userId' | 'createdAt'> & { id?: string };

export type WebhookEventRecord = {
  id: string;
  provider: string;
  eventType: string;
  status: WebhookEventStatus;
  resolvedUserId: string | null;
  externalIdentity: Record<string, unknown>;
  rawHeaders: Record<string, unknown>;
  rawPayload: unknown;
  error: string;
  createdAt: string;
  updatedAt: string;
};

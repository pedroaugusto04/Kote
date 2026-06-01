import type { CredentialRecordStatus, WebhookEventStatus } from '../../contracts/enums.js';

export type { WebhookEventStatus };

export type KbUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  role: string;
  avatarStorageKey: string | null;
  avatarMimeType: string | null;
  avatarSizeBytes: number | null;
  avatarUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthIdentityRecord = {
  id: string;
  provider: string;
  providerUserId: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  metadata: Record<string, unknown>;
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

export type IntegrationConnectionSessionRecord = {
  id: string;
  userId: string;
  workspaceSlug: string;
  provider: string;
  stateHash: string;
  verificationCodeHash: string;
  status: string;
  metadata: Record<string, unknown>;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceRecord = {
  workspaceSlug: string;
  displayName: string;
  whatsappChatJid: string;
  telegramChatId: string;
  createdAt: string;
  updatedAt: string;
};

export type RepositoryRecord = {
  id: string;
  workspaceSlug: string;
  externalId: string;
  fullName: string;
  htmlUrl: string | null;
  description: string | null;
  defaultBranch: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  projectSlug: string;
  displayName: string;
  workspaceSlug: string;
  repositories: RepositoryRecord[];
  defaultTags: string[];
  enabled: boolean;
  favorite: boolean;
};

export type ProjectFolderRecord = {
  id: string;
  projectSlug: string;
  workspaceSlug: string;
  parentFolderId: string | null;
  displayName: string;
  folderSlug: string;
  fullSlugPath: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteRecord = {
  id: string;
  path: string;
  type: string;
  title: string;
  projectSlug: string;
  workspaceSlug: string;
  folderId: string | null;
  status: string;
  tags: string[];
  occurredAt: string;
  sourceChannel: string;
  summary: string;
  markdown: string;
  markdownStorageKey: string;
  frontmatter: Record<string, unknown>;
  metadata: Record<string, unknown>;
  origin: string;
  source: string;
  links: string[];
  attachmentCount?: number;
};

export type AttachmentRecord = {
  id: string;
  userId: string;
  noteId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
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
export type SaveProjectFolderInput = ProjectFolderRecord;

export type SaveWorkspaceInput = WorkspaceRecord;

export type SaveNoteInput = Omit<NoteRecord, 'id' | 'markdownStorageKey'> & { id?: string; markdownStorageKey?: string };

export type SaveAttachmentInput = Omit<AttachmentRecord, 'id' | 'userId' | 'createdAt' | 'storageKey'> & {
  id?: string;
  storageKey?: string;
  dataBase64?: string;
};

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

export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
  updatedAt: string;
};


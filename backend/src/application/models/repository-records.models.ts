import type { CredentialRecordStatus, WebhookEventStatus } from '../../contracts/enums.js';

export type { WebhookEventStatus };

export type KbUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string | null;
  role: string;
  avatar: string;
  cpfCnpj: string;
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
  workspaceId: string;
  workspaceSlug?: string;
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
  workspaceId: string;
  workspaceSlug?: string;
  provider: string;
  identityType: string;
  externalId: string;
  credentialId: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationConnectionSessionRecord = {
  id: string;
  userId: string;
  workspaceId: string;
  workspaceSlug?: string;
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
  id: string;
  workspaceSlug: string;
  displayName: string;
  whatsappChatJid: string;
  telegramChatId: string;
  createdAt: string;
  updatedAt: string;
};

export type RepositoryRecord = {
  id: string;
  workspaceId: string;
  externalId: string;
  fullName: string;
  htmlUrl: string | null;
  description: string | null;
  defaultBranch: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  id: string;
  projectSlug: string;
  displayName: string;
  workspaceId: string;
  workspaceSlug?: string;
  repositories: RepositoryRecord[];
  defaultTags: string[];
  enabled: boolean;
  favorite: boolean;
};

export type ProjectFolderRecord = {
  id: string;
  projectId: string;
  projectSlug?: string;
  workspaceSlug?: string;
  parentFolderId: string | null;
  displayName: string;
  folderSlug: string;
  fullSlugPath: string;
  createdAt: string;
  updatedAt: string;
};

export type CategoryRecord = {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  color: string;
  colorDark: string | null;
  icon: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoteRecord = {
  id: string;
  path: string;
  categories: CategoryRecord[];
  title: string;
  projectId: string;
  workspaceId: string;
  projectSlug?: string;
  workspaceSlug?: string;
  folderId: string | null;
  status: string;
  tags: string[];
  occurredAt: string;
  sourceChannel: string;
  summary: string;
  markdown: string;
  markdownStorageKey: string;
  metadata: Record<string, unknown>;
  source: string;
  sessionId: string;
  reminderAt: string;
  attachmentCount?: number;
  isPinned?: boolean;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
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
  createdAt: string;
};

export type ConversationStateRecord = {
  userId: string;
  workspaceId: string;
  workspaceSlug?: string;
  conversationKey: string;
  state: unknown;
  updatedAt: string;
};

export type SaveProjectInput = ProjectRecord;
export type SaveProjectFolderInput = ProjectFolderRecord;

export type SaveWorkspaceInput = WorkspaceRecord;

export type SaveNoteInput = Omit<NoteRecord, 'id' | 'markdownStorageKey' | 'categories'> & {
  id?: string;
  markdownStorageKey?: string;
  categoryIds?: string[];
  categories?: CategoryRecord[];
};

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

export type PlanRecord = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  maxStorageBytes: number;
  maxAiCreditsPerMonth: number;
  maxWorkspaces: number;
  maxProjectsPerWorkspace: number;
  priceCents: number;
  billingPeriod: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserSubscriptionRecord = {
  userId: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  gatewayName: string;
  gatewaySubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserSubscriptionWithPlan = UserSubscriptionRecord & {
  plan: PlanRecord;
};

export type QuotaUsageEventRecord = {
  id: string;
  userId: string;
  type: string;
  amount: number;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type QuotaAdjustmentRecord = {
  id: string;
  userId: string;
  type: string;
  amount: number;
  description: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type SaveQuotaUsageEventInput = Omit<QuotaUsageEventRecord, 'id' | 'createdAt' | 'metadata'> & {
  id?: string;
  metadata?: Record<string, unknown>;
};



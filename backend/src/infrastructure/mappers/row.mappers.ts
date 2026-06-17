import { CredentialRecordStatus, WebhookTrigger } from '../../contracts/enums.js';
import type {
  AuthIdentityRecord,
  AttachmentRecord,
  ConversationStateRecord,
  ExternalIdentityRecord,
  IntegrationConnectionSessionRecord,
  IntegrationCredentialRecord,
  KbUser,
  NoteRecord,
  ProjectFolderRecord,
  ProjectRecord,
  RepositoryRecord,
  WebhookEventRecord,
  WorkspaceRecord,
  PushSubscriptionRecord,
} from '../../application/models/repository-records.models.js';
import type { WebhookSubscriptionRecord } from '../../application/models/webhook-subscription.models.js';

type Row = Record<string, unknown>;

function field(row: Row, snake: string, camel: string): unknown {
  if (camel in row) return row[camel];
  return row[snake];
}

function fieldString(row: Row, snake: string, camel: string, fallback = ''): string {
  const value = field(row, snake, camel);
  return value == null ? fallback : String(value);
}

function nowIso(value: unknown): string {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return new Date().toISOString();
    }
    return value.toISOString();
  }
  return String(value || new Date().toISOString());
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

export function userFromRow(row: Row): KbUser {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(field(row, 'display_name', 'displayName') || row.email),
    passwordHash: field(row, 'password_hash', 'passwordHash') == null ? null : String(field(row, 'password_hash', 'passwordHash')),
    role: String(row.role),
    avatar: fieldString(row, 'avatar', 'avatar'),
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

export function authIdentityFromRow(row: Row): AuthIdentityRecord {
  return {
    id: String(row.id),
    provider: String(row.provider),
    providerUserId: fieldString(row, 'provider_user_id', 'providerUserId'),
    userId: fieldString(row, 'user_id', 'userId'),
    email: String(row.email || ''),
    emailVerified: field(row, 'email_verified', 'emailVerified') === true,
    displayName: fieldString(row, 'display_name', 'displayName'),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

export function credentialFromRow(row: Row): IntegrationCredentialRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceSlug: fieldString(row, 'workspace_slug', 'workspaceSlug'),
    provider: String(row.provider),
    status: String(row.status) === CredentialRecordStatus.Revoked ? CredentialRecordStatus.Revoked : CredentialRecordStatus.Connected,
    encryptedConfig: field(row, 'encrypted_config', 'encryptedConfig'),
    publicMetadata: (field(row, 'public_metadata', 'publicMetadata') || {}) as Record<string, unknown>,
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
    revokedAt: field(row, 'revoked_at', 'revokedAt') ? nowIso(field(row, 'revoked_at', 'revokedAt')) : null,
  };
}

export function identityFromRow(row: Row): ExternalIdentityRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceSlug: fieldString(row, 'workspace_slug', 'workspaceSlug', 'default'),
    provider: String(row.provider),
    identityType: fieldString(row, 'identity_type', 'identityType', 'external_id'),
    externalId: fieldString(row, 'external_id', 'externalId'),
    credentialId: field(row, 'credential_id', 'credentialId') ? String(field(row, 'credential_id', 'credentialId')) : null,
    verifiedAt: field(row, 'verified_at', 'verifiedAt') ? nowIso(field(row, 'verified_at', 'verifiedAt')) : null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    publicMetadata: (field(row, 'public_metadata', 'publicMetadata') || {}) as Record<string, unknown>,
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

export function connectionSessionFromRow(row: Row): IntegrationConnectionSessionRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceSlug: fieldString(row, 'workspace_slug', 'workspaceSlug', 'default'),
    provider: String(row.provider),
    stateHash: fieldString(row, 'state_hash', 'stateHash'),
    verificationCodeHash: fieldString(row, 'verification_code_hash', 'verificationCodeHash'),
    status: fieldString(row, 'status', 'status', 'pending'),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    expiresAt: nowIso(field(row, 'expires_at', 'expiresAt')),
    consumedAt: field(row, 'consumed_at', 'consumedAt') ? nowIso(field(row, 'consumed_at', 'consumedAt')) : null,
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

export function workspaceFromRow(row: Row): WorkspaceRecord {
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug');
  return {
    workspaceSlug,
    displayName: String(field(row, 'display_name', 'displayName') || workspaceSlug),
    whatsappChatJid: fieldString(row, 'whatsapp_chat_jid', 'whatsappChatJid'),
    telegramChatId: fieldString(row, 'telegram_chat_id', 'telegramChatId'),
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

export function repositoryFromRow(row: Row): RepositoryRecord {
  return {
    id: String(row.id),
    workspaceSlug: fieldString(row, 'workspace_slug', 'workspaceSlug'),
    externalId: String(field(row, 'external_id', 'externalId') ?? '0'),
    fullName: fieldString(row, 'full_name', 'fullName'),
    htmlUrl: field(row, 'html_url', 'htmlUrl') ? String(field(row, 'html_url', 'htmlUrl')) : null,
    description: row.description ? String(row.description) : null,
    defaultBranch: field(row, 'default_branch', 'defaultBranch') ? String(field(row, 'default_branch', 'defaultBranch')) : null,
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

export function projectFromRow(row: Row): ProjectRecord {
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug');
  return {
    projectSlug: fieldString(row, 'project_slug', 'projectSlug'),
    displayName: String(field(row, 'display_name', 'displayName') || field(row, 'project_slug', 'projectSlug')),
    workspaceSlug,
    repositories: (Array.isArray(row.repositories) ? row.repositories : []).map((r: any) => ({
      id: String(r.id),
      workspaceSlug: String(r.workspace_slug || r.workspaceSlug || workspaceSlug),
      externalId: String(r.external_id ?? r.externalId ?? '0'),
      fullName: String(r.full_name ?? r.fullName ?? ''),
      htmlUrl: (r.html_url || r.htmlUrl) ? String(r.html_url || r.htmlUrl) : null,
      description: r.description ? String(r.description) : null,
      defaultBranch: (r.default_branch || r.defaultBranch) ? String(r.default_branch || r.defaultBranch) : null,
      createdAt: nowIso(r.created_at || r.createdAt || new Date().toISOString()),
      updatedAt: nowIso(r.updated_at || r.updatedAt || new Date().toISOString()),
    })),
    defaultTags: stringArray(field(row, 'default_tags', 'defaultTags')),
    enabled: row.enabled !== false,
    favorite: field(row, 'is_favorite', 'isFavorite') === true,
  };
}

export function projectFolderFromRow(row: Row): ProjectFolderRecord {
  return {
    id: String(row.id),
    projectSlug: fieldString(row, 'project_slug', 'projectSlug'),
    workspaceSlug: fieldString(row, 'workspace_slug', 'workspaceSlug'),
    parentFolderId: field(row, 'parent_folder_id', 'parentFolderId') ? String(field(row, 'parent_folder_id', 'parentFolderId')) : null,
    displayName: fieldString(row, 'display_name', 'displayName'),
    folderSlug: fieldString(row, 'folder_slug', 'folderSlug'),
    fullSlugPath: fieldString(row, 'full_slug_path', 'fullSlugPath'),
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

export function noteFromRow(row: Row): NoteRecord {
  return {
    id: String(row.id),
    path: fieldString(row, 'path', 'path'),
    type: fieldString(row, 'type', 'type', 'event'),
    title: fieldString(row, 'title', 'title'),
    projectSlug: fieldString(row, 'project_slug', 'projectSlug'),
    workspaceSlug: fieldString(row, 'workspace_slug', 'workspaceSlug'),
    folderId: field(row, 'folder_id', 'folderId') ? String(field(row, 'folder_id', 'folderId')) : null,
    status: fieldString(row, 'status', 'status', 'active'),
    tags: stringArray(row.tags),
    occurredAt: nowIso(field(row, 'occurred_at', 'occurredAt')),
    sourceChannel: fieldString(row, 'source_channel', 'sourceChannel'),
    summary: fieldString(row, 'summary', 'summary'),
    markdown: fieldString(row, 'markdown', 'markdown'),
    markdownStorageKey: fieldString(row, 'markdown_storage_key', 'markdownStorageKey'),
    frontmatter: (row.frontmatter || {}) as Record<string, unknown>,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    source: String(field(row, 'source', 'source') || field(row, 'source_channel', 'sourceChannel') || ''),
    sessionId: fieldString(row, 'session_id', 'sessionId'),
    reminderDate: fieldString(row, 'reminder_date', 'reminderDate'),
    reminderAt: fieldString(row, 'reminder_at', 'reminderAt'),
    attachmentCount: Number(field(row, 'attachment_count', 'attachmentCount') || 0),
    isPinned: field(row, 'is_pinned', 'isPinned') === true,
  };
}

export function webhookEventFromRow(row: Row): WebhookEventRecord {
  return {
    id: String(row.id),
    provider: String(row.provider),
    eventType: fieldString(row, 'event_type', 'eventType'),
    status: row.status as WebhookEventRecord['status'],
    resolvedUserId: field(row, 'resolved_user_id', 'resolvedUserId') ? String(field(row, 'resolved_user_id', 'resolvedUserId')) : null,
    externalIdentity: (field(row, 'external_identity', 'externalIdentity') || {}) as Record<string, unknown>,
    rawHeaders: (field(row, 'raw_headers', 'rawHeaders') || {}) as Record<string, unknown>,
    rawPayload: field(row, 'raw_payload', 'rawPayload') || {},
    error: fieldString(row, 'error', 'error'),
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

export function attachmentFromRow(row: Row): AttachmentRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    noteId: fieldString(row, 'note_id', 'noteId'),
    fileName: fieldString(row, 'file_name', 'fileName'),
    mimeType: fieldString(row, 'mime_type', 'mimeType', 'application/octet-stream'),
    sizeBytes: Number(field(row, 'size_bytes', 'sizeBytes') || 0),
    storageKey: fieldString(row, 'storage_key', 'storageKey'),
    checksumSha256: fieldString(row, 'checksum_sha256', 'checksumSha256'),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
  };
}

export function conversationStateFromRow(row: Row): ConversationStateRecord {
  return {
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceSlug: fieldString(row, 'workspace_slug', 'workspaceSlug'),
    conversationKey: fieldString(row, 'conversation_key', 'conversationKey'),
    state: row.state || {},
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

export function webhookSubscriptionFromRow(row: Row): WebhookSubscriptionRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceSlug: fieldString(row, 'workspace_slug', 'workspaceSlug'),
    label: fieldString(row, 'label', 'label'),
    url: fieldString(row, 'url', 'url'),
    secret: row.secret == null ? null : String(row.secret),
    events: stringArray(row.events).filter((e): e is WebhookTrigger =>
      Object.values(WebhookTrigger).includes(e as WebhookTrigger),
    ),
    enabled: row.enabled !== false,
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

export function pushSubscriptionFromRow(row: Row): PushSubscriptionRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    createdAt: nowIso(field(row, 'created_at', 'createdAt')),
    updatedAt: nowIso(field(row, 'updated_at', 'updatedAt')),
  };
}

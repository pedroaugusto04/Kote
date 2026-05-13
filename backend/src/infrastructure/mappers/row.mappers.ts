import { CredentialRecordStatus } from '../../contracts/enums.js';
import type {
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
} from '../../application/models/repository-records.models.js';

type Row = Record<string, unknown>;

function nowIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

export function userFromRow(row: Row): KbUser {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name || row.email),
    passwordHash: String(row.password_hash),
    role: String(row.role),
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
  };
}

export function credentialFromRow(row: Row): IntegrationCredentialRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    workspaceSlug: String(row.workspace_slug),
    provider: String(row.provider),
    status: String(row.status) === CredentialRecordStatus.Revoked ? CredentialRecordStatus.Revoked : CredentialRecordStatus.Connected,
    encryptedConfig: row.encrypted_config,
    publicMetadata: (row.public_metadata || {}) as Record<string, unknown>,
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
    revokedAt: row.revoked_at ? nowIso(row.revoked_at) : null,
  };
}

export function identityFromRow(row: Row): ExternalIdentityRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    workspaceSlug: String(row.workspace_slug || 'default'),
    provider: String(row.provider),
    identityType: String(row.identity_type || 'external_id'),
    externalId: String(row.external_id),
    credentialId: row.credential_id ? String(row.credential_id) : null,
    verifiedAt: row.verified_at ? nowIso(row.verified_at) : null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    publicMetadata: (row.public_metadata || {}) as Record<string, unknown>,
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
  };
}

export function connectionSessionFromRow(row: Row): IntegrationConnectionSessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    workspaceSlug: String(row.workspace_slug || 'default'),
    provider: String(row.provider),
    stateHash: String(row.state_hash || ''),
    verificationCodeHash: String(row.verification_code_hash || ''),
    status: String(row.status || 'pending'),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    expiresAt: nowIso(row.expires_at),
    consumedAt: row.consumed_at ? nowIso(row.consumed_at) : null,
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
  };
}

export function workspaceFromRow(row: Row): WorkspaceRecord {
  return {
    workspaceSlug: String(row.workspace_slug),
    displayName: String(row.display_name || row.workspace_slug),
    whatsappGroupJid: String(row.whatsapp_group_jid || ''),
    telegramChatId: String(row.telegram_chat_id || ''),
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
  };
}

export function repositoryFromRow(row: Row): RepositoryRecord {
  return {
    id: String(row.id),
    workspaceSlug: String(row.workspace_slug),
    externalId: String(row.external_id),
    fullName: String(row.full_name),
    htmlUrl: row.html_url ? String(row.html_url) : null,
    description: row.description ? String(row.description) : null,
    defaultBranch: row.default_branch ? String(row.default_branch) : null,
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
  };
}

export function projectFromRow(row: Row): ProjectRecord {
  return {
    projectSlug: String(row.project_slug),
    displayName: String(row.display_name || row.project_slug),
    workspaceSlug: String(row.workspace_slug || ''),
    repositories: (Array.isArray(row.repositories) ? row.repositories : []).map((r: any) => ({
      id: String(r.id),
      workspaceSlug: String(r.workspace_slug || r.workspaceSlug || row.workspace_slug || ''),
      externalId: String(r.external_id ?? r.externalId ?? '0'),
      fullName: String(r.full_name ?? r.fullName ?? ''),
      htmlUrl: (r.html_url || r.htmlUrl) ? String(r.html_url || r.htmlUrl) : null,
      description: r.description ? String(r.description) : null,
      defaultBranch: (r.default_branch || r.defaultBranch) ? String(r.default_branch || r.defaultBranch) : null,
      createdAt: nowIso(r.created_at || new Date().toISOString()),
      updatedAt: nowIso(r.updated_at || new Date().toISOString()),
    })),
    aliases: stringArray(row.aliases),
    defaultTags: stringArray(row.default_tags),
    enabled: row.enabled !== false,
  };
}

export function projectFolderFromRow(row: Row): ProjectFolderRecord {
  return {
    id: String(row.id),
    projectSlug: String(row.project_slug || ''),
    workspaceSlug: String(row.workspace_slug || ''),
    parentFolderId: row.parent_folder_id ? String(row.parent_folder_id) : null,
    displayName: String(row.display_name || ''),
    folderSlug: String(row.folder_slug || ''),
    fullSlugPath: String(row.full_slug_path || ''),
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
  };
}

export function noteFromRow(row: Row): NoteRecord {
  return {
    id: String(row.id),
    path: String(row.path || ''),
    type: String(row.type || 'event'),
    title: String(row.title || ''),
    projectSlug: String(row.project_slug || ''),
    workspaceSlug: String(row.workspace_slug || ''),
    folderId: row.folder_id ? String(row.folder_id) : null,
    status: String(row.status || 'active'),
    tags: stringArray(row.tags),
    occurredAt: nowIso(row.occurred_at),
    sourceChannel: String(row.source_channel || ''),
    summary: String(row.summary || ''),
    markdown: String(row.markdown || ''),
    markdownStorageKey: String(row.markdown_storage_key || ''),
    frontmatter: (row.frontmatter || {}) as Record<string, unknown>,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    origin: String(row.origin || 'postgres'),
    source: String(row.source || row.source_channel || ''),
    links: stringArray(row.links),
    attachmentCount: Number(row.attachment_count || 0),
  };
}

export function webhookEventFromRow(row: Row): WebhookEventRecord {
  return {
    id: String(row.id),
    provider: String(row.provider),
    eventType: String(row.event_type || ''),
    status: row.status as WebhookEventRecord['status'],
    resolvedUserId: row.resolved_user_id ? String(row.resolved_user_id) : null,
    externalIdentity: (row.external_identity || {}) as Record<string, unknown>,
    rawHeaders: (row.raw_headers || {}) as Record<string, unknown>,
    rawPayload: row.raw_payload || {},
    error: String(row.error || ''),
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
  };
}

export function attachmentFromRow(row: Row): AttachmentRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    noteId: String(row.note_id || ''),
    fileName: String(row.file_name || ''),
    mimeType: String(row.mime_type || 'application/octet-stream'),
    sizeBytes: Number(row.size_bytes || 0),
    storageKey: String(row.storage_key || ''),
    checksumSha256: String(row.checksum_sha256 || ''),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: nowIso(row.created_at),
  };
}

export function conversationStateFromRow(row: Row): ConversationStateRecord {
  return {
    userId: String(row.user_id),
    workspaceSlug: String(row.workspace_slug),
    conversationKey: String(row.conversation_key),
    state: row.state || {},
    updatedAt: nowIso(row.updated_at),
  };
}

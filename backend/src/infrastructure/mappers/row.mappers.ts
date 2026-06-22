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
  CategoryRecord,
  PlanRecord,
  UserSubscriptionRecord,
  UserSubscriptionWithPlan,
  QuotaUsageEventRecord,
  QuotaAdjustmentRecord,
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

function toIsoTimestamp(value: unknown): string {
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
    cpfCnpj: fieldString(row, 'cpf_cnpj', 'cpfCnpj', ''),
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
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
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function credentialFromRow(row: Row): IntegrationCredentialRecord {
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug', '');
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceId: fieldString(row, 'workspace_id', 'workspaceId'),
    ...(workspaceSlug ? { workspaceSlug } : {}),
    provider: String(row.provider),
    status: String(row.status) === CredentialRecordStatus.Revoked ? CredentialRecordStatus.Revoked : CredentialRecordStatus.Connected,
    encryptedConfig: field(row, 'encrypted_config', 'encryptedConfig'),
    publicMetadata: (field(row, 'public_metadata', 'publicMetadata') || {}) as Record<string, unknown>,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
    revokedAt: field(row, 'revoked_at', 'revokedAt') ? toIsoTimestamp(field(row, 'revoked_at', 'revokedAt')) : null,
  };
}

export function identityFromRow(row: Row): ExternalIdentityRecord {
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug', '');
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceId: fieldString(row, 'workspace_id', 'workspaceId'),
    ...(workspaceSlug ? { workspaceSlug } : {}),
    provider: String(row.provider),
    identityType: fieldString(row, 'identity_type', 'identityType', 'external_id'),
    externalId: fieldString(row, 'external_id', 'externalId'),
    credentialId: field(row, 'credential_id', 'credentialId') ? String(field(row, 'credential_id', 'credentialId')) : null,
    verifiedAt: field(row, 'verified_at', 'verifiedAt') ? toIsoTimestamp(field(row, 'verified_at', 'verifiedAt')) : null,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function connectionSessionFromRow(row: Row): IntegrationConnectionSessionRecord {
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug', '');
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceId: fieldString(row, 'workspace_id', 'workspaceId'),
    ...(workspaceSlug ? { workspaceSlug } : {}),
    provider: String(row.provider),
    stateHash: fieldString(row, 'state_hash', 'stateHash'),
    verificationCodeHash: fieldString(row, 'verification_code_hash', 'verificationCodeHash'),
    status: fieldString(row, 'status', 'status', 'pending'),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    expiresAt: toIsoTimestamp(field(row, 'expires_at', 'expiresAt')),
    consumedAt: field(row, 'consumed_at', 'consumedAt') ? toIsoTimestamp(field(row, 'consumed_at', 'consumedAt')) : null,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function workspaceFromRow(row: Row): WorkspaceRecord {
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug');
  return {
    id: String(row.id),
    workspaceSlug,
    displayName: String(field(row, 'display_name', 'displayName') || workspaceSlug),
    whatsappChatJid: fieldString(row, 'whatsapp_chat_jid', 'whatsappChatJid'),
    telegramChatId: fieldString(row, 'telegram_chat_id', 'telegramChatId'),
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function repositoryFromRow(row: Row): RepositoryRecord {
  return {
    id: String(row.id),
    workspaceId: fieldString(row, 'workspace_id', 'workspaceId'),
    externalId: String(field(row, 'external_id', 'externalId') ?? '0'),
    fullName: fieldString(row, 'full_name', 'fullName'),
    htmlUrl: field(row, 'html_url', 'htmlUrl') ? String(field(row, 'html_url', 'htmlUrl')) : null,
    description: row.description ? String(row.description) : null,
    defaultBranch: field(row, 'default_branch', 'defaultBranch') ? String(field(row, 'default_branch', 'defaultBranch')) : null,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function projectFromRow(row: Row): ProjectRecord {
  const workspaceId = fieldString(row, 'workspace_id', 'workspaceId');
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug', '');
  return {
    id: String(row.id),
    projectSlug: fieldString(row, 'project_slug', 'projectSlug'),
    displayName: String(field(row, 'display_name', 'displayName') || field(row, 'project_slug', 'projectSlug')),
    workspaceId,
    ...(workspaceSlug ? { workspaceSlug } : {}),
    repositories: (Array.isArray(row.repositories) ? row.repositories : []).map((r: any) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id || r.workspaceId || workspaceId),
      workspaceSlug: String(r.workspace_slug || r.workspaceSlug || workspaceSlug || ''),
      externalId: String(r.external_id ?? r.externalId ?? '0'),
      fullName: String(r.full_name ?? r.fullName ?? ''),
      htmlUrl: (r.html_url || r.htmlUrl) ? String(r.html_url || r.htmlUrl) : null,
      description: r.description ? String(r.description) : null,
      defaultBranch: (r.default_branch || r.defaultBranch) ? String(r.default_branch || r.defaultBranch) : null,
      createdAt: toIsoTimestamp(r.created_at || r.createdAt || new Date().toISOString()),
      updatedAt: toIsoTimestamp(r.updated_at || r.updatedAt || new Date().toISOString()),
    })),
    defaultTags: stringArray(field(row, 'default_tags', 'defaultTags')),
    enabled: row.enabled !== false,
    favorite: field(row, 'is_favorite', 'isFavorite') === true,
  };
}

export function projectFolderFromRow(row: Row): ProjectFolderRecord {
  const projectSlug = fieldString(row, 'project_slug', 'projectSlug', '');
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug', '');
  return {
    id: String(row.id),
    projectId: fieldString(row, 'project_id', 'projectId'),
    ...(projectSlug ? { projectSlug } : {}),
    ...(workspaceSlug ? { workspaceSlug } : {}),
    parentFolderId: field(row, 'parent_folder_id', 'parentFolderId') ? String(field(row, 'parent_folder_id', 'parentFolderId')) : null,
    displayName: fieldString(row, 'display_name', 'displayName'),
    folderSlug: fieldString(row, 'folder_slug', 'folderSlug'),
    fullSlugPath: fieldString(row, 'full_slug_path', 'fullSlugPath'),
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function categoryFromRow(row: Row): CategoryRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceId: fieldString(row, 'workspace_id', 'workspaceId'),
    name: fieldString(row, 'name', 'name'),
    color: fieldString(row, 'color', 'color', '#9e9e9e'),
    colorDark: field(row, 'color_dark', 'colorDark') == null ? null : String(field(row, 'color_dark', 'colorDark')),
    icon: fieldString(row, 'icon', 'icon', ''),
    isSystem: field(row, 'is_system', 'isSystem') === true,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function noteFromRow(row: Row): NoteRecord {
  const projectSlug = fieldString(row, 'project_slug', 'projectSlug', '');
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug', '');
  const categoriesList = Array.isArray(row.categories)
    ? row.categories.map((c: any) => categoryFromRow(c))
    : [];
  return {
    id: String(row.id),
    path: fieldString(row, 'path', 'path'),
    categories: categoriesList,
    title: fieldString(row, 'title', 'title'),
    projectId: fieldString(row, 'project_id', 'projectId'),
    workspaceId: fieldString(row, 'workspace_id', 'workspaceId'),
    ...(projectSlug ? { projectSlug } : {}),
    ...(workspaceSlug ? { workspaceSlug } : {}),
    folderId: field(row, 'folder_id', 'folderId') ? String(field(row, 'folder_id', 'folderId')) : null,
    status: fieldString(row, 'status', 'status', 'active'),
    tags: stringArray(row.tags),
    // Preserve `occurred_at` semantics (business/event date). If it's
    // missing, fall back to `created_at` (DB insertion timestamp)
    occurredAt: field(row, 'occurred_at', 'occurredAt')
      ? toIsoTimestamp(field(row, 'occurred_at', 'occurredAt'))
      : field(row, 'created_at', 'createdAt')
      ? toIsoTimestamp(field(row, 'created_at', 'createdAt'))
      : '',
    sourceChannel: fieldString(row, 'source_channel', 'sourceChannel'),
    summary: fieldString(row, 'summary', 'summary'),
    markdown: fieldString(row, 'markdown', 'markdown'),
    markdownStorageKey: fieldString(row, 'markdown_storage_key', 'markdownStorageKey'),
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
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
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
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
  };
}

export function conversationStateFromRow(row: Row): ConversationStateRecord {
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug', '');
  return {
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceId: fieldString(row, 'workspace_id', 'workspaceId'),
    ...(workspaceSlug ? { workspaceSlug } : {}),
    conversationKey: fieldString(row, 'conversation_key', 'conversationKey'),
    state: row.state || {},
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function webhookSubscriptionFromRow(row: Row): WebhookSubscriptionRecord {
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug', '');
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    workspaceId: fieldString(row, 'workspace_id', 'workspaceId'),
    ...(workspaceSlug ? { workspaceSlug } : {}),
    label: fieldString(row, 'label', 'label'),
    url: fieldString(row, 'url', 'url'),
    secret: row.secret == null ? null : String(row.secret),
    events: stringArray(row.events).filter((e): e is WebhookTrigger =>
      Object.values(WebhookTrigger).includes(e as WebhookTrigger),
    ),
    enabled: row.enabled !== false,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function pushSubscriptionFromRow(row: Row): PushSubscriptionRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function planFromRow(row: Row): PlanRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    displayName: fieldString(row, 'display_name', 'displayName'),
    description: fieldString(row, 'description', 'description'),
    maxStorageBytes: Number(field(row, 'max_storage_bytes', 'maxStorageBytes') || 0),
    maxAiRequestsPerMonth: Number(field(row, 'max_ai_requests_per_month', 'maxAiRequestsPerMonth') || 0),
    maxWorkspaces: Number(field(row, 'max_workspaces', 'maxWorkspaces') || 0),
    maxProjectsPerWorkspace: Number(field(row, 'max_projects_per_workspace', 'maxProjectsPerWorkspace') || 0),
    priceCents: Number(field(row, 'price_cents', 'priceCents') || 0),
    billingPeriod: fieldString(row, 'billing_period', 'billingPeriod', 'monthly'),
    isActive: field(row, 'is_active', 'isActive') !== false,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function userSubscriptionFromRow(row: Row): UserSubscriptionRecord {
  return {
    userId: fieldString(row, 'user_id', 'userId'),
    planId: fieldString(row, 'plan_id', 'planId'),
    status: fieldString(row, 'status', 'status', 'active'),
    currentPeriodStart: toIsoTimestamp(field(row, 'current_period_start', 'currentPeriodStart')),
    currentPeriodEnd: toIsoTimestamp(field(row, 'current_period_end', 'currentPeriodEnd')),
    gatewayName: fieldString(row, 'gateway_name', 'gatewayName', 'asaas'),
    gatewaySubscriptionId: field(row, 'gateway_subscription_id', 'gatewaySubscriptionId') ? String(field(row, 'gateway_subscription_id', 'gatewaySubscriptionId')) : null,
    gatewayCustomerId: field(row, 'gateway_customer_id', 'gatewayCustomerId') ? String(field(row, 'gateway_customer_id', 'gatewayCustomerId')) : null,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function userSubscriptionWithPlanFromRow(row: Row): UserSubscriptionWithPlan {
  const sub = userSubscriptionFromRow(row);
  const plan = planFromRow(row);
  return {
    ...sub,
    plan,
  };
}

export function quotaUsageEventFromRow(row: Row): QuotaUsageEventRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    type: String(row.type),
    amount: Number(row.amount || 1),
    description: row.description ? String(row.description) : null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: toIsoTimestamp(row.createdAt || row.created_at),
  };
}

export function quotaAdjustmentFromRow(row: Row): QuotaAdjustmentRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    type: String(row.type),
    amount: Number(row.amount || 0),
    description: row.description ? String(row.description) : null,
    expiresAt: row.expiresAt || row.expires_at ? toIsoTimestamp(row.expiresAt || row.expires_at) : null,
    createdAt: toIsoTimestamp(row.createdAt || row.created_at),
  };
}

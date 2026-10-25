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
import type { DependencyWatchRecord } from '../../application/ports/dependency-watcher/dependency-watcher.repository.js';
import type { DependencyEcosystem } from '../../contracts/enums.js';

type Row = Record<string, unknown>;

function field(row: Row, snake: string, camel: string): unknown {
  if (camel in row) return row[camel];
  return row[snake];
}

function fieldString(row: Row, snake: string, camel: string, fallback = ''): string {
  const value = field(row, snake, camel);
  return value == null ? fallback : String(value);
}

function fieldNullableString(row: Row, snake: string, camel: string): string | null {
  const value = field(row, snake, camel);
  return value == null ? null : String(value);
}

function fieldNumber(row: Row, snake: string, camel: string, fallback = 0): number {
  const value = field(row, snake, camel);
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function fieldBoolean(row: Row, snake: string, camel: string, fallback = false): boolean {
  const value = field(row, snake, camel);
  return value === undefined ? fallback : Boolean(value);
}

export function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return value.toISOString();
  }

  const s = String(value || '').trim();
  if (!s) return '';

  let normalized = s;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalized)) {
    normalized = normalized.replace(' ', 'T') + 'Z';
  }

  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();

  return '';
}

function toNullableIsoTimestamp(value: unknown): string | null {
  const ts = toIsoTimestamp(value);
  return ts || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

export function userFromRow(row: Row): KbUser {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(field(row, 'display_name', 'displayName') || row.email),
    passwordHash: fieldNullableString(row, 'password_hash', 'passwordHash'),
    role: String(row.role),
    avatar: fieldString(row, 'avatar', 'avatar'),
    cpfCnpj: fieldString(row, 'cpf_cnpj', 'cpfCnpj', ''),
    vsCodeInstalledAt: toNullableIsoTimestamp(field(row, 'vscode_installed_at', 'vsCodeInstalledAt')),
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
    revokedAt: toNullableIsoTimestamp(field(row, 'revoked_at', 'revokedAt')),
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
    credentialId: fieldNullableString(row, 'credential_id', 'credentialId'),
    verifiedAt: toNullableIsoTimestamp(field(row, 'verified_at', 'verifiedAt')),
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
    consumedAt: toNullableIsoTimestamp(field(row, 'consumed_at', 'consumedAt')),
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function workspaceFromRow(row: Row): WorkspaceRecord {
  const workspaceSlug = fieldString(row, 'workspace_slug', 'workspaceSlug');
  return {
    id: String(row.id),
    userId: String(field(row, 'user_id', 'userId')),
    workspaceSlug,
    displayName: String(field(row, 'display_name', 'displayName') || workspaceSlug),
    whatsappChatJid: fieldString(row, 'whatsapp_chat_jid', 'whatsappChatJid'),
    telegramChatId: fieldString(row, 'telegram_chat_id', 'telegramChatId'),
    dependencyWatcherEnabled: field(row, 'dependency_watcher_enabled', 'dependencyWatcherEnabled') === true,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
  };
}

export function repositoryFromRow(row: Row): RepositoryRecord {
  return {
    id: String(row.id),
    workspaceId: fieldString(row, 'workspace_id', 'workspaceId'),
    workspaceSlug: fieldString(row, 'workspace_slug', 'workspaceSlug'),
    externalId: fieldString(row, 'external_id', 'externalId'),
    fullName: fieldString(row, 'full_name', 'fullName'),
    htmlUrl: fieldNullableString(row, 'html_url', 'htmlUrl'),
    description: row.description ? String(row.description) : null,
    defaultBranch: fieldNullableString(row, 'default_branch', 'defaultBranch'),
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
    repositories: (Array.isArray(row.repositories) ? row.repositories : []).map((r: Row) => ({
      id: String(r.id),
      workspaceId: fieldString(r, 'workspace_id', 'workspaceId', workspaceId),
      workspaceSlug: fieldString(r, 'workspace_slug', 'workspaceSlug', workspaceSlug),
      externalId: fieldString(r, 'external_id', 'externalId', '0'),
      fullName: fieldString(r, 'full_name', 'fullName'),
      htmlUrl: fieldNullableString(r, 'html_url', 'htmlUrl'),
      description: r.description ? String(r.description) : null,
      defaultBranch: fieldNullableString(r, 'default_branch', 'defaultBranch'),
      createdAt: toIsoTimestamp(field(r, 'created_at', 'createdAt') || new Date().toISOString()),
      updatedAt: toIsoTimestamp(field(r, 'updated_at', 'updatedAt') || new Date().toISOString()),
    })),
    defaultTags: stringArray(field(row, 'default_tags', 'defaultTags')),
    enabled: row.enabled !== false,
    favorite: field(row, 'is_favorite', 'isFavorite') === true,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
    updatedAt: toIsoTimestamp(field(row, 'updated_at', 'updatedAt')),
    noteCount: field(row, 'note_count', 'noteCount') != null ? fieldNumber(row, 'note_count', 'noteCount') : undefined,
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
    parentFolderId: fieldNullableString(row, 'parent_folder_id', 'parentFolderId'),
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
    colorDark: fieldNullableString(row, 'color_dark', 'colorDark'),
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
    ? row.categories.map((c: Row) => categoryFromRow(c))
    : [];

  const createdAt = toIsoTimestamp(field(row, 'created_at', 'createdAt'));
  const occurredAt = toIsoTimestamp(field(row, 'occurred_at', 'occurredAt')) || createdAt;

  return {
    id: String(row.id),
    path: fieldString(row, 'path', 'path'),
    categories: categoriesList,
    title: fieldString(row, 'title', 'title'),
    projectId: fieldString(row, 'project_id', 'projectId'),
    workspaceId: fieldString(row, 'workspace_id', 'workspaceId'),
    ...(projectSlug ? { projectSlug } : {}),
    ...(workspaceSlug ? { workspaceSlug } : {}),
    folderId: fieldNullableString(row, 'folder_id', 'folderId'),
    status: fieldString(row, 'status', 'status', 'active'),
    tags: stringArray(row.tags),
    occurredAt,
    createdAt,
    sourceChannel: fieldString(row, 'source_channel', 'sourceChannel'),
    summary: fieldString(row, 'summary', 'summary'),
    markdown: fieldString(row, 'markdown', 'markdown'),
    markdownStorageKey: fieldString(row, 'markdown_storage_key', 'markdownStorageKey'),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    source: String(field(row, 'source', 'source') || field(row, 'source_channel', 'sourceChannel') || ''),
    sessionId: fieldString(row, 'session_id', 'sessionId'),
    reminderAt: toIsoTimestamp(field(row, 'reminder_at', 'reminderAt')),
    attachmentCount: fieldNumber(row, 'attachment_count', 'attachmentCount', 0),
    isPinned: field(row, 'is_pinned', 'isPinned') === true,
    sizeBytes: fieldNumber(row, 'size_bytes', 'sizeBytes', 0),
    ftsRank: field(row, 'ts_rank', 'tsRank') != null ? fieldNumber(row, 'ts_rank', 'tsRank') : undefined,
  };
}

export function webhookEventFromRow(row: Row): WebhookEventRecord {
  return {
    id: String(row.id),
    provider: String(row.provider),
    eventType: fieldString(row, 'event_type', 'eventType'),
    status: row.status as WebhookEventRecord['status'],
    resolvedUserId: fieldNullableString(row, 'resolved_user_id', 'resolvedUserId'),
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
    sizeBytes: fieldNumber(row, 'size_bytes', 'sizeBytes', 0),
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
    maxStorageBytes: fieldNumber(row, 'max_storage_bytes', 'maxStorageBytes', 0),
    maxAiCreditsPerMonth: fieldNumber(row, 'max_ai_credits_per_month', 'maxAiCreditsPerMonth', 0),
    maxWorkspaces: fieldNumber(row, 'max_workspaces', 'maxWorkspaces', 0),
    maxProjectsPerWorkspace: fieldNumber(row, 'max_projects_per_workspace', 'maxProjectsPerWorkspace', 0),
    priceCents: fieldNumber(row, 'price_cents', 'priceCents', 0),
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
    gatewaySubscriptionId: fieldNullableString(row, 'gateway_subscription_id', 'gatewaySubscriptionId'),
    billingCycle: fieldString(row, 'billing_cycle', 'billingCycle', 'monthly'),
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
    amount: fieldNumber(row, 'amount', 'amount', 1),
    description: row.description ? String(row.description) : null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
  };
}

export function quotaAdjustmentFromRow(row: Row): QuotaAdjustmentRecord {
  return {
    id: String(row.id),
    userId: fieldString(row, 'user_id', 'userId'),
    type: String(row.type),
    amount: fieldNumber(row, 'amount', 'amount', 0),
    description: row.description ? String(row.description) : null,
    expiresAt: toNullableIsoTimestamp(field(row, 'expires_at', 'expiresAt')),
    createdAt: toIsoTimestamp(field(row, 'created_at', 'createdAt')),
  };
}

export function dependencyWatchFromRow(record: Row): DependencyWatchRecord {
  return {
    id: String(record.id),
    userId: fieldString(record, 'user_id', 'userId'),
    workspaceId: fieldString(record, 'workspace_id', 'workspaceId'),
    workspaceSlug: fieldString(record, 'workspace_slug', 'workspaceSlug'),
    ecosystem: record.ecosystem as DependencyEcosystem,
    packageName: fieldString(record, 'package_name', 'packageName'),
    currentVersion: fieldString(record, 'current_version', 'currentVersion'),
    latestSeenVersion: fieldString(record, 'latest_seen_version', 'latestSeenVersion'),
    checkIntervalHours: fieldNumber(record, 'check_interval_hours', 'checkIntervalHours', 24),
    lastCheckedAt: (field(record, 'last_checked_at', 'lastCheckedAt') ?? null) as Date | null,
    lastAlertedAt: (field(record, 'last_alerted_at', 'lastAlertedAt') ?? null) as Date | null,
    lastUrgency: (field(record, 'last_urgency', 'lastUrgency') ?? null) as 'optional' | 'recommended' | 'critical' | null,
    enabled: fieldBoolean(record, 'enabled', 'enabled'),
    repositoryId: fieldNullableString(record, 'repository_id', 'repositoryId'),
    createdAt: (field(record, 'created_at', 'createdAt') ?? new Date()) as Date,
    updatedAt: (field(record, 'updated_at', 'updatedAt') ?? new Date()) as Date,
  };
}

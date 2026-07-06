import { pgTable, uuid, text, timestamp, jsonb, boolean, bigint, integer, index, pgEnum, uniqueIndex, decimal } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { pgTable as pgTableV2 } from 'drizzle-orm/pg-core';

// Enums
export const noteStatusEnum = pgEnum('note_status_enum', ['active', 'pending', 'resolved', 'archived', 'sent', 'overdue']);
export const askConfidenceEnum = pgEnum('ask_confidence_enum', ['low', 'medium', 'high']);
export const credentialStatusEnum = pgEnum('credential_status_enum', ['connected', 'revoked']);

// Enum value types for type-safe inserts and updates
export type NoteStatus = typeof noteStatusEnum.enumValues[number];
export type AskConfidence = typeof askConfidenceEnum.enumValues[number];
export type CredentialStatus = typeof credentialStatusEnum.enumValues[number];

// Users
export const users = pgTable('kb_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  avatar: text('avatar').default(''),
  cpfCnpj: text('cpf_cnpj').default(''),
  vsCodeInstalledAt: timestamp('vscode_installed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  emailIdx: index('kb_users_email_lower_idx').on(table.email),
}));

// Integration Credentials
export const integrationCredentials = pgTable('kb_integration_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  status: credentialStatusEnum('status').notNull().default('connected'),
  encryptedConfig: jsonb('encrypted_config').notNull().default('{}'),
  publicMetadata: jsonb('public_metadata').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  revokedAt: timestamp('revoked_at'),
}, (table) => ({
  scopeIdx: uniqueIndex('kb_integration_credentials_scope_idx').on(table.userId, table.workspaceId, table.provider),
}));

// External Identities
export const externalIdentities = pgTable('kb_external_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  identityType: text('identity_type').notNull().default('external_id'),
  externalId: text('external_id').notNull(),
  credentialId: uuid('credential_id').references(() => integrationCredentials.id, { onDelete: 'set null' }),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  providerTypeExternalIdx: index('kb_external_identities_provider_type_external_idx').on(table.provider, table.identityType, table.externalId),
}));

// Integration Connection SessionsV2
export const integrationConnectionSessions = pgTable('kb_integration_connection_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  stateHash: text('state_hash').notNull(),
  verificationCodeHash: text('verification_code_hash').notNull(),
  status: text('status').notNull().default('pending'),
  metadata: jsonb('metadata').notNull().default('{}'),
  expiresAt: timestamp('expires_at'),
  consumedAt: timestamp('consumed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  stateIdx: index('kb_integration_connection_sessions_state_idx').on(table.provider, table.stateHash, table.status, table.expiresAt),
  codeIdx: index('kb_integration_connection_sessions_code_idx').on(table.provider, table.verificationCodeHash, table.status, table.expiresAt),
  userIdx: index('kb_integration_connection_sessions_user_idx').on(table.userId, table.workspaceId, table.provider, table.createdAt),
}));

// Workspaces
export const workspaces = pgTable('kb_workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceSlug: text('workspace_slug').notNull(),
  displayName: text('display_name').notNull(),
  whatsappChatJid: text('whatsapp_chat_jid').notNull().default(''),
  telegramChatId: text('telegram_chat_id').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userSlugIdx: index('kb_workspaces_user_slug_idx').on(table.userId, table.workspaceSlug),
}));

// User-scoped auto-action settings
export const autoActionGlobal = pgTable('kb_auto_action_global', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  action: text('action').notNull().default('none'),
  afterHours: integer('after_hours'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: index('kb_auto_action_global_user_idx').on(table.userId),
}));

// Projects
export const projects = pgTable('kb_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectSlug: text('project_slug').notNull(),
  displayName: text('display_name').notNull(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(true),
  isFavorite: boolean('is_favorite').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userSlugIdx: index('kb_projects_user_slug_idx').on(table.userId, table.projectSlug),
}));

// Notes
export const notes = pgTable('kb_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  title: text('title').notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id'),
  status: noteStatusEnum('status').notNull().default('active'),
  tags: jsonb('tags').notNull().default('[]'),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
  sourceChannel: text('source_channel').notNull().default(''),
  summary: text('summary').notNull().default(''),
  markdownStorageKey: text('markdown_storage_key').notNull().default(''),
  metadata: jsonb('metadata').notNull().default('{}'),
  source: text('source').notNull().default(''),
  sessionId: text('session_id').notNull().default(''),
  reminderAt: timestamp('reminder_at'),
  isPinned: boolean('is_pinned').default(false),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userProjectIdx: index('kb_notes_user_project_idx').on(table.userId, table.projectId),
  userWorkspaceIdx: index('kb_notes_user_workspace_idx').on(table.userId, table.workspaceId),
  userProjectFolderIdx: index('kb_notes_user_project_folder_idx').on(table.userId, table.projectId, table.folderId),
  userSourceSessionIdx: index('kb_notes_user_source_session_idx').on(table.userId, table.source, table.sessionId),
  reminderAtIdx: index('kb_notes_reminder_at_idx').on(table.reminderAt),
}));

// Note Links
export const noteLinks = pgTable('kb_note_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  noteId: uuid('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  target: text('target').notNull(),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userNoteIdx: index('kb_note_links_user_note_idx').on(table.userId, table.noteId),
}));

// Attachments
export const attachments = pgTable('kb_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  noteId: uuid('note_id').references(() => notes.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull().default('application/octet-stream'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
  storageKey: text('storage_key').notNull().default(''),
  checksumSha256: text('checksum_sha256').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userNoteIdx: index('kb_attachments_user_note_idx').on(table.userId, table.noteId),
}));

// Conversation States
export const conversationStates = pgTable('kb_conversation_states', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  conversationKey: text('conversation_key').notNull(),
  state: jsonb('state').notNull().default('{}'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  pk: index('kb_conversation_states_pk').on(table.userId, table.workspaceId, table.conversationKey),
}));

// Reminder Dispatch State
export const reminderDispatchState = pgTable('kb_reminder_dispatch_state', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull(),
  dispatchKey: text('dispatch_key').notNull(),
  reminderId: uuid('reminder_id').notNull(),
  sentAt: timestamp('sent_at').notNull().defaultNow(),
}, (table) => ({
  pk: index('kb_reminder_dispatch_state_pk').on(table.userId, table.workspaceId, table.mode, table.dispatchKey, table.reminderId),
}));

// Reminder Dispatch Failures
export const reminderDispatchFailures = pgTable('kb_reminder_dispatch_failures', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull(),
  dispatchKey: text('dispatch_key').notNull(),
  reminderId: uuid('reminder_id').notNull(),
  channel: text('channel').notNull(),
  attemptCount: integer('attempt_count').notNull().default(1),
  nextRetryAt: timestamp('next_retry_at'),
  lastError: text('last_error').notNull().default(''),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  pk: index('kb_reminder_dispatch_failures_pk').on(table.userId, table.workspaceId, table.mode, table.dispatchKey, table.reminderId, table.channel),
}));

// Project Brief History
export const projectBriefHistory = pgTable('kb_project_brief_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  brief: jsonb('brief').notNull(),
  sourceRefs: jsonb('source_refs').notNull().default('[]'),
  contextHash: text('context_hash').notNull(),
  contextWindow: integer('context_window').notNull().default(30),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  generatedAt: timestamp('generated_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_project_brief_history_user').on(table.userId),
  projectIdx: index('idx_project_brief_history_project').on(table.userId, table.projectId),
  userWorkspaceProjectIdx: index('idx_project_brief_history_user_workspace_project').on(table.userId, table.workspaceId, table.projectId),
}));

// Webhook Events
export const webhookEvents = pgTable('kb_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  eventType: text('event_type').notNull().default(''),
  status: text('status').notNull(),
  resolvedUserId: uuid('resolved_user_id').references(() => users.id, { onDelete: 'set null' }),
  externalIdentity: jsonb('external_identity').notNull().default('{}'),
  rawHeaders: jsonb('raw_headers').notNull().default('{}'),
  rawPayload: jsonb('raw_payload').notNull().default('{}'),
  error: text('error').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  providerStatusIdx: index('kb_webhook_events_provider_status_idx').on(table.provider, table.status, table.createdAt),
}));

// Repositories
export const repositories = pgTable('kb_repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  externalId: bigint('external_id', { mode: 'number' }).notNull(),
  fullName: text('full_name').notNull(),
  htmlUrl: text('html_url'),
  description: text('description'),
  defaultBranch: text('default_branch'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  workspaceExternalIdx: uniqueIndex('kb_repositories_workspace_id_external_id_idx').on(table.workspaceId, table.externalId),
}));

// Project Repositories
export const projectRepositories = pgTable('kb_project_repositories', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: index('kb_project_repositories_pk').on(table.projectId, table.repositoryId),
}));

// Project Default Tags
export const projectDefaultTags = pgTable('kb_project_default_tags', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  tag: text('tag').notNull(),
}, (table) => ({
  pk: index('kb_project_default_tags_pk').on(table.projectId, table.tag),
}));

// Project Folders
export const projectFolders = pgTable('kb_project_folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  parentFolderId: uuid('parent_folder_id'),
  displayName: text('display_name').notNull(),
  folderSlug: text('folder_slug').notNull(),
  fullSlugPath: text('full_slug_path').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  siblingSlugIdx: index('kb_project_folders_sibling_slug_idx').on(table.userId, table.projectId, table.parentFolderId, table.folderSlug),
  fullPathIdx: index('kb_project_folders_full_path_idx').on(table.userId, table.projectId, table.fullSlugPath),
  parentIdx: index('kb_project_folders_parent_idx').on(table.userId, table.projectId, table.parentFolderId),
}));

export const projectFoldersRelations = relations(projectFolders, ({ one, many }) => ({
  user: one(users, {
    fields: [projectFolders.userId],
    references: [users.id],
  }),
  parentFolder: one(projectFolders, {
    fields: [projectFolders.parentFolderId],
    references: [projectFolders.id],
    relationName: 'parentFolder',
  }),
  subfolders: many(projectFolders, { relationName: 'parentFolder' }),
  notes: many(notes),
}));

// Push Subscriptions
export const pushSubscriptions = pgTable('kb_push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_push_subs_user').on(table.userId),
}));

// Ask History
export const askHistory = pgTable('kb_ask_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  confidence: askConfidenceEnum('confidence').notNull().default('low'),
  sources: jsonb('sources').notNull().default('[]'),
  relatedNotes: jsonb('related_notes').notNull().default('[]'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userCreatedIdx: index('kb_ask_history_user_created_idx').on(table.userId, table.createdAt),
  userProjectCreatedIdx: index('kb_ask_history_user_project_created_idx').on(table.userId, table.projectId, table.createdAt),
  conversationIdIdx: index('kb_ask_history_conversation_id_idx').on(table.conversationId),
}));

// Webhook Subscriptions
export const webhookSubscriptions = pgTable('kb_webhook_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default(''),
  url: text('url').notNull(),
  secret: text('secret'),
  events: text('events').array().notNull().default([]),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_webhook_subs_user').on(table.userId),
  eventsIdx: index('idx_webhook_subs_events').using('gin', table.events),
}));

// Webhook Idempotency Keys
export const webhookIdempotencyKeys = pgTable('kb_webhook_idempotency_keys', {
  provider: text('provider').notNull(),
  eventType: text('event_type').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  resolvedUserId: uuid('resolved_user_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  pk: index('kb_webhook_idempotency_keys_pk').on(table.provider, table.eventType, table.idempotencyKey),
}));

// Auth Identities
export const authIdentities = pgTable('kb_auth_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  providerUserId: text('provider_user_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  displayName: text('display_name').notNull().default(''),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  providerProviderUserIdIdx: index('kb_auth_identities_provider_provider_user_id_idx').on(table.provider, table.providerUserId),
  userIdProviderIdx: index('kb_auth_identities_user_id_provider_idx').on(table.userId, table.provider),
}));

// Categories
export const categories = pgTable('kb_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#9e9e9e'),
  colorDark: text('color_dark'),
  icon: text('icon').notNull().default(''),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  workspaceNameIdx: index('kb_categories_workspace_name_idx').on(table.workspaceId, table.name),
}));

// Note Categories
export const noteCategories = pgTable('kb_note_categories', {
  noteId: uuid('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: index('kb_note_categories_pk').on(table.noteId, table.categoryId),
}));

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  integrationCredentials: many(integrationCredentials),
  externalIdentities: many(externalIdentities),
  integrationConnectionSessions: many(integrationConnectionSessions),
  workspaces: many(workspaces),
  projects: many(projects),
  notes: many(notes),
  noteLinks: many(noteLinks),
  attachments: many(attachments),
  conversationStates: many(conversationStates),
  reminderDispatchState: many(reminderDispatchState),
  webhookEvents: many(webhookEvents),
  projectFolders: many(projectFolders),
  pushSubscriptions: many(pushSubscriptions),
  askHistory: many(askHistory),
  webhookSubscriptions: many(webhookSubscriptions),
  categories: many(categories),
  subscription: one(userSubscriptions, {
    fields: [users.id],
    references: [userSubscriptions.userId],
  }),
  quotaUsageEvents: many(quotaUsageEvents),
  quotaAdjustments: many(quotaAdjustments),
}));

export const notesRelations = relations(notes, ({ one, many }) => ({
  user: one(users, {
    fields: [notes.userId],
    references: [users.id],
  }),
  folder: one(projectFolders, {
    fields: [notes.folderId],
    references: [projectFolders.id],
  }),
  attachments: many(attachments),
  noteLinks: many(noteLinks),
  noteCategories: many(noteCategories),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
  workspace: one(workspaces, {
    fields: [categories.workspaceId],
    references: [workspaces.id],
  }),
  noteCategories: many(noteCategories),
}));

export const noteCategoriesRelations = relations(noteCategories, ({ one }) => ({
  note: one(notes, {
    fields: [noteCategories.noteId],
    references: [notes.id],
  }),
  category: one(categories, {
    fields: [noteCategories.categoryId],
    references: [categories.id],
  }),
}));
// Billing Enums
export const paymentGatewayEnum = pgEnum('kb_payment_gateway_enum', ['asaas', 'stripe']);
export const billingCycleEnum = pgEnum('kb_billing_cycle_enum', ['monthly', 'yearly']);
export const billingTypeEnum = pgEnum('kb_billing_type_enum', ['boleto', 'pix', 'credit_card']);
export const paymentStatusEnum = pgEnum('kb_payment_status_enum', ['pending', 'received', 'confirmed', 'overdue', 'refunded', 'canceled', 'partially_refunded']);
export const billingIntentTypeEnum = pgEnum('kb_billing_intent_type_enum', ['new', 'upgrade', 'change_cycle']);
export const billingIntentStatusEnum = pgEnum('kb_billing_intent_status_enum', ['pending', 'processing', 'done', 'failed', 'canceled']);
export const webhookProcessStatusEnum = pgEnum('kb_webhook_process_status_enum', ['pending', 'processing', 'done', 'failed']);
export const subscriptionChangeStatusEnum = pgEnum('kb_subscription_change_status_enum', ['scheduled', 'applied', 'canceled']);
export const subscriptionChangeTypeEnum = pgEnum('kb_subscription_change_type_enum', ['downgrade', 'change_cycle']);
export const paymentKindEnum = pgEnum('kb_payment_kind_enum', ['recurring', 'upgrade']);

export type PaymentGateway = typeof paymentGatewayEnum.enumValues[number];
export type BillingCycle = typeof billingCycleEnum.enumValues[number];
export type BillingType = typeof billingTypeEnum.enumValues[number];
export type PaymentStatus = typeof paymentStatusEnum.enumValues[number];
export type BillingIntentType = typeof billingIntentTypeEnum.enumValues[number];
export type BillingIntentStatus = typeof billingIntentStatusEnum.enumValues[number];
export type WebhookProcessStatus = typeof webhookProcessStatusEnum.enumValues[number];
export type SubscriptionChangeStatus = typeof subscriptionChangeStatusEnum.enumValues[number];
export type SubscriptionChangeType = typeof subscriptionChangeTypeEnum.enumValues[number];
export type PaymentKind = typeof paymentKindEnum.enumValues[number];

// Plans table
export const plans = pgTable('kb_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(), // 'free', 'pro', 'enterprise'
  displayName: text('display_name').notNull(),
  description: text('description').notNull().default(''),
  maxStorageBytes: bigint('max_storage_bytes', { mode: 'number' }).notNull(),
  maxAiCreditsPerMonth: integer('max_ai_credits_per_month').notNull(),
  maxWorkspaces: integer('max_workspaces').notNull(),
  maxProjectsPerWorkspace: integer('max_projects_per_workspace').notNull(),
  priceCents: integer('price_cents').notNull().default(0),
  priceUsdCents: integer('price_usd_cents').notNull().default(0),
  billingPeriod: text('billing_period').notNull().default('monthly'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  slugUniqueIdx: uniqueIndex('kb_plans_slug_idx').on(table.slug),
}));

// User Subscriptions table
export const userSubscriptions = pgTable('kb_user_subscriptions', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: text('status').notNull().default('active'), // active, pending, past_due, canceled, inactive
  currentPeriodStart: timestamp('current_period_start').notNull().defaultNow(),
  currentPeriodEnd: timestamp('current_period_end').notNull().defaultNow(),
  gatewayName: text('gateway_name').notNull().default('asaas'), // 'asaas', 'stripe', etc.
  gatewaySubscriptionId: text('gateway_subscription_id'),
  billingCycle: billingCycleEnum('billing_cycle').notNull().default('monthly'),
  billingType: billingTypeEnum('billing_type'),
  nextDueDate: timestamp('next_due_date'),
  startedAt: timestamp('started_at'),
  pastDueAt: timestamp('past_due_at'),
  canceledAt: timestamp('canceled_at'),
  createdFromIntentId: uuid('created_from_intent_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Billing Customers table
export const billingCustomers = pgTable('kb_billing_customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  gateway: paymentGatewayEnum('gateway').notNull().default('asaas'),
  gatewayCustomerId: text('gateway_customer_id').notNull(),
  hasCreditCardOnFile: boolean('has_credit_card_on_file').notNull().default(false),
  creditCardToken: text('credit_card_token'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userGatewayUniqueIdx: uniqueIndex('uq_billing_user_gateway').on(table.userId, table.gateway),
  gatewayCustomerUniqueIdx: uniqueIndex('uq_gateway_customer_id').on(table.gateway, table.gatewayCustomerId),
}));

// Billing Payments table
export const billingPayments = pgTable('kb_billing_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').references(() => userSubscriptions.userId, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  gateway: paymentGatewayEnum('gateway').notNull(),
  gatewayPaymentId: text('gateway_payment_id').notNull(),
  status: paymentStatusEnum('status').notNull().default('pending'),
  billingType: billingTypeEnum('billing_type'),
  kind: paymentKindEnum('kind').notNull().default('recurring'),
  gatewayStatus: text('gateway_status'),
  value: decimal('value', { precision: 10, scale: 2 }).notNull(),
  dueDate: timestamp('due_date').notNull(),
  paidAt: timestamp('paid_at'),
  invoiceUrl: text('invoice_url'),
  bankSlipUrl: text('bank_slip_url'),
  pixQrCode: text('pix_qr_code'),
  pixQrCodeUrl: text('pix_qr_code_url'),
  description: text('description'),
  stripeClientSecret: text('stripe_client_secret'),
  lastGatewayEventAt: timestamp('last_gateway_event_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userGatewayPaymentUniqueIdx: uniqueIndex('uq_user_gateway_payment').on(table.userId, table.gateway, table.gatewayPaymentId),
  userIdx: index('idx_billing_payments_user').on(table.userId),
}));

// Billing Intents table
export const billingIntents = pgTable('kb_billing_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: billingIntentTypeEnum('type').notNull(),
  status: billingIntentStatusEnum('status').notNull().default('pending'),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').references(() => plans.id, { onDelete: 'restrict' }),
  subscriptionId: uuid('subscription_id').references(() => userSubscriptions.userId, { onDelete: 'set null' }),
  billingCycle: billingCycleEnum('billing_cycle'),
  creditCardToken: text('credit_card_token'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_billing_intents_user').on(table.userId),
  statusIdx: index('idx_billing_intents_status').on(table.status),
}));

// Subscription Change Requests table
export const subscriptionChangeRequests = pgTable('kb_subscription_change_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fromSubscriptionId: uuid('from_subscription_id').notNull().references(() => userSubscriptions.userId),
  fromGateway: paymentGatewayEnum('from_gateway').notNull(),
  fromGatewaySubscriptionId: text('from_gateway_subscription_id').notNull(),
  toPlanId: uuid('to_plan_id').notNull().references(() => plans.id),
  toBillingCycle: billingCycleEnum('to_billing_cycle').notNull(),
  toBillingType: billingTypeEnum('to_billing_type').notNull().default('credit_card'),
  type: subscriptionChangeTypeEnum('type').notNull().default('change_cycle'),
  status: subscriptionChangeStatusEnum('status').notNull().default('scheduled'),
  effectiveAt: timestamp('effective_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_sub_change_user').on(table.userId),
  statusEffectiveIdx: index('idx_sub_change_status_effective').on(table.status, table.effectiveAt),
}));

// Gateway Webhook Events table
export const gatewayWebhookEvents = pgTable('kb_gateway_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  gateway: paymentGatewayEnum('gateway').notNull(),
  dedupKey: text('dedup_key').notNull(),
  eventType: text('event_type').notNull(),
  gatewayEventId: text('gateway_event_id'),
  gatewayPaymentId: text('gateway_payment_id'),
  gatewaySubscriptionId: text('gateway_subscription_id'),
  payload: jsonb('payload'),
  status: webhookProcessStatusEnum('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  lastDispatchedAt: timestamp('last_dispatched_at'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  gatewayDedupUniqueIdx: uniqueIndex('uq_gateway_webhook_dedup').on(table.gateway, table.dedupKey),
  statusCreatedIdx: index('idx_webhook_status_created').on(table.status, table.createdAt),
}));

// Quota Usage Events table
export const quotaUsageEvents = pgTable('kb_quota_usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'ai_request', 'transcription', etc.
  amount: integer('amount').notNull().default(1),
  description: text('description'),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdTypeCreatedIdx: index('kb_quota_usage_events_user_type_created_idx').on(table.userId, table.type, table.createdAt),
}));

// Quota Adjustments table
export const quotaAdjustments = pgTable('kb_quota_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'storage', 'ai_request', etc.
  amount: bigint('amount', { mode: 'number' }).notNull(), // positive for additions, negative for reductions
  description: text('description'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdTypeIdx: index('kb_quota_adjustments_user_type_idx').on(table.userId, table.type),
}));

// New Relations definitions
export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(userSubscriptions),
}));

export const userSubscriptionsRelations = relations(userSubscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [userSubscriptions.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [userSubscriptions.planId],
    references: [plans.id],
  }),
  payments: many(billingPayments),
  changeRequests: many(subscriptionChangeRequests),
}));

export const billingCustomersRelations = relations(billingCustomers, ({ one }) => ({
  user: one(users, {
    fields: [billingCustomers.userId],
    references: [users.id],
  }),
}));

export const billingPaymentsRelations = relations(billingPayments, ({ one }) => ({
  user: one(users, {
    fields: [billingPayments.userId],
    references: [users.id],
  }),
  subscription: one(userSubscriptions, {
    fields: [billingPayments.subscriptionId],
    references: [userSubscriptions.userId],
  }),
}));

export const billingIntentsRelations = relations(billingIntents, ({ one }) => ({
  user: one(users, {
    fields: [billingIntents.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [billingIntents.planId],
    references: [plans.id],
  }),
  subscription: one(userSubscriptions, {
    fields: [billingIntents.subscriptionId],
    references: [userSubscriptions.userId],
  }),
}));

export const subscriptionChangeRequestsRelations = relations(subscriptionChangeRequests, ({ one }) => ({
  user: one(users, {
    fields: [subscriptionChangeRequests.userId],
    references: [users.id],
  }),
  fromSubscription: one(userSubscriptions, {
    fields: [subscriptionChangeRequests.fromSubscriptionId],
    references: [userSubscriptions.userId],
  }),
  toPlan: one(plans, {
    fields: [subscriptionChangeRequests.toPlanId],
    references: [plans.id],
  }),
}));

export const quotaUsageEventsRelations = relations(quotaUsageEvents, ({ one }) => ({
  user: one(users, {
    fields: [quotaUsageEvents.userId],
    references: [users.id],
  }),
}));

export const quotaAdjustmentsRelations = relations(quotaAdjustments, ({ one }) => ({
  user: one(users, {
    fields: [quotaAdjustments.userId],
    references: [users.id],
  }),
}));

// GitHub Backfill Jobs
export const githubBackfillJobs = pgTable('kb_github_backfill_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceSlug: text('workspace_slug').notNull(),
  repositories: jsonb('repositories').notNull().default([]),
  status: text('status').notNull().default('queued'),
  total: integer('total').notNull().default(0),
  processed: integer('processed').notNull().default(0),
  imported: integer('imported').notNull().default(0),
  skipped: integer('skipped').notNull().default(0),
  limit: integer('limit').notNull().default(5),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => ({
  userIdIdx: index('kb_github_backfill_jobs_user_id_idx').on(table.userId, table.id),
}));


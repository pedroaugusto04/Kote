import { pgTable, uuid, text, jsonb, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { timestamp } from './column-helpers.js';
import { credentialStatusEnum } from './enums.schema.js';
import { users } from './auth.schema.js';
import { workspaces } from './content.schema.js';

// Integration Credentials
export const integrationCredentials = pgTable('kb_integration_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  status: credentialStatusEnum('status').notNull().default('connected'),
  encryptedConfig: jsonb('encrypted_config').notNull().default('{}'),
  publicMetadata: jsonb('public_metadata').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
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
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  stateIdx: index('kb_integration_connection_sessions_state_idx').on(table.provider, table.stateHash, table.status, table.expiresAt),
  codeIdx: index('kb_integration_connection_sessions_code_idx').on(table.provider, table.verificationCodeHash, table.status, table.expiresAt),
  userIdx: index('kb_integration_connection_sessions_user_idx').on(table.userId, table.workspaceId, table.provider, table.createdAt),
}));

// Conversation States
export const conversationStates = pgTable('kb_conversation_states', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  conversationKey: text('conversation_key').notNull(),
  state: jsonb('state').notNull().default('{}'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
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
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  lastError: text('last_error').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: index('kb_reminder_dispatch_failures_pk').on(table.userId, table.workspaceId, table.mode, table.dispatchKey, table.reminderId, table.channel),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerStatusIdx: index('kb_webhook_events_provider_status_idx').on(table.provider, table.status, table.createdAt),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: index('kb_webhook_idempotency_keys_pk').on(table.provider, table.eventType, table.idempotencyKey),
}));

// Push Subscriptions
export const pushSubscriptions = pgTable('kb_push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_push_subs_user').on(table.userId),
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

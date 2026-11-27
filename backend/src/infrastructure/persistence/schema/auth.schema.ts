import { pgTable, uuid, text, jsonb, boolean, integer, index } from 'drizzle-orm/pg-core';
import { timestamp } from './column-helpers.js';

// Users
export const users = pgTable('kb_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  avatar: text('avatar').default(''),
  cpfCnpj: text('cpf_cnpj').default(''),
  vsCodeInstalledAt: timestamp('vscode_installed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailIdx: index('kb_users_email_lower_idx').on(table.email),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerProviderUserIdIdx: index('kb_auth_identities_provider_provider_user_id_idx').on(table.provider, table.providerUserId),
  userIdProviderIdx: index('kb_auth_identities_user_id_provider_idx').on(table.userId, table.provider),
}));

// User-scoped auto-action settings
export const autoActionGlobal = pgTable('kb_auto_action_global', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  action: text('action').notNull().default('none'),
  afterHours: integer('after_hours'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('kb_auto_action_global_user_idx').on(table.userId),
}));

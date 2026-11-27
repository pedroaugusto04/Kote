import { pgTable, uuid, text, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { timestamp } from './column-helpers.js';
import { dependencyEcosystemEnum, dependencyUrgencyEnum } from './enums.schema.js';
import { users } from './auth.schema.js';
import { repositories, workspaces } from './content.schema.js';

// Dependency Watch
export const dependencyWatch = pgTable('kb_dependency_watch', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  ecosystem: dependencyEcosystemEnum('ecosystem').notNull(),
  packageName: text('package_name').notNull(),
  currentVersion: text('current_version').notNull(),
  latestSeenVersion: text('latest_seen_version').notNull().default(''),
  checkIntervalHours: integer('check_interval_hours').notNull().default(24),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastAlertedAt: timestamp('last_alerted_at', { withTimezone: true }),
  lastUrgency: dependencyUrgencyEnum('last_urgency'),
  enabled: boolean('enabled').notNull().default(true),
  repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userWorkspaceIdx: index('kb_dependency_watch_user_workspace_idx').on(table.userId, table.workspaceId),
  ecosystemPackageIdx: uniqueIndex('kb_dependency_watch_ecosystem_package_idx').on(table.userId, table.workspaceId, table.ecosystem, table.packageName),
  lastCheckedIdx: index('kb_dependency_watch_last_checked_idx').on(table.lastCheckedAt),
  repositoryIdx: index('kb_dependency_watch_repository_id_idx').on(table.repositoryId),
}));

export const dependencyMonitoredRepositories = pgTable('kb_dependency_monitored_repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  workspaceIdx: index('kb_dependency_monitored_repositories_workspace_idx').on(table.userId, table.workspaceId),
  uniqueRepo: uniqueIndex('kb_dependency_monitored_repositories_unique_idx').on(table.userId, table.workspaceId, table.repositoryId),
}));

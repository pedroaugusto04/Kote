import { pgTable, uuid, text, jsonb, boolean, bigint, integer, index, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { timestamp } from './column-helpers.js';
import { askConfidenceEnum, noteStatusEnum } from './enums.schema.js';
import { users } from './auth.schema.js';

// Workspaces
export const workspaces = pgTable('kb_workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceSlug: text('workspace_slug').notNull(),
  displayName: text('display_name').notNull(),
  whatsappChatJid: text('whatsapp_chat_jid').notNull().default(''),
  telegramChatId: text('telegram_chat_id').notNull().default(''),
  dependencyWatcherEnabled: boolean('dependency_watcher_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userSlugIdx: index('kb_workspaces_user_slug_idx').on(table.userId, table.workspaceSlug),
  userSlugUnique: unique('kb_workspaces_user_slug_unique').on(table.userId, table.workspaceSlug),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userSlugIdx: index('kb_projects_user_slug_idx').on(table.userId, table.projectSlug),
  userSlugUnique: unique('kb_projects_user_slug_unique').on(table.userId, table.projectSlug),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  siblingSlugIdx: index('kb_project_folders_sibling_slug_idx').on(table.userId, table.projectId, table.parentFolderId, table.folderSlug),
  fullPathIdx: index('kb_project_folders_full_path_idx').on(table.userId, table.projectId, table.fullSlugPath),
  parentIdx: index('kb_project_folders_parent_idx').on(table.userId, table.projectId, table.parentFolderId),
}));

// Notes
export const notes = pgTable('kb_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  title: text('title').notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id').references(() => projectFolders.id, { onDelete: 'set null' }),
  status: noteStatusEnum('status').notNull().default('active'),
  tags: jsonb('tags').notNull().default('[]'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  sourceChannel: text('source_channel').notNull().default(''),
  summary: text('summary').notNull().default(''),
  bodySearchText: text('body_search_text').notNull().default(''),
  markdownStorageKey: text('markdown_storage_key').notNull().default(''),
  metadata: jsonb('metadata').notNull().default('{}'),
  source: text('source').notNull().default(''),
  sessionId: text('session_id').notNull().default(''),
  reminderAt: timestamp('reminder_at', { withTimezone: true }),
  isPinned: boolean('is_pinned').default(false),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userProjectIdx: index('kb_notes_user_project_idx').on(table.userId, table.projectId),
  projectIdIdx: index('kb_notes_project_id_idx').on(table.projectId),
  userWorkspaceIdx: index('kb_notes_user_workspace_idx').on(table.userId, table.workspaceId),
  userProjectFolderIdx: index('kb_notes_user_project_folder_idx').on(table.userId, table.projectId, table.folderId),
  folderIdIdx: index('kb_notes_folder_id_idx').on(table.folderId),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userNoteIdx: index('kb_attachments_user_note_idx').on(table.userId, table.noteId),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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

// Repositories
export const repositories = pgTable('kb_repositories', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  externalId: bigint('external_id', { mode: 'number' }).notNull(),
  fullName: text('full_name').notNull(),
  htmlUrl: text('html_url'),
  description: text('description'),
  defaultBranch: text('default_branch'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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

// Project Files for Knowledge Coverage
export const projectFiles = pgTable('kb_project_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  projPathUnique: uniqueIndex('uq_kb_project_files_proj_path').on(table.projectId, table.filePath),
  projIdx: index('kb_project_files_proj_idx').on(table.projectId),
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
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_project_brief_history_user').on(table.userId),
  projectIdx: index('idx_project_brief_history_project').on(table.userId, table.projectId),
  userWorkspaceProjectIdx: index('idx_project_brief_history_user_workspace_project').on(table.userId, table.workspaceId, table.projectId),
}));

// Project Map Clusters
export const projectMapClusters = pgTable('kb_project_map_clusters', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  clustersPayload: jsonb('clusters_payload').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userWorkspaceProjectUniqueIdx: uniqueIndex('kb_project_map_clusters_user_workspace_project_idx').on(table.userId, table.workspaceId, table.projectId),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userCreatedIdx: index('kb_ask_history_user_created_idx').on(table.userId, table.createdAt),
  userProjectCreatedIdx: index('kb_ask_history_user_project_created_idx').on(table.userId, table.projectId, table.createdAt),
  conversationIdIdx: index('kb_ask_history_conversation_id_idx').on(table.conversationId),
}));

// Content Relations
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

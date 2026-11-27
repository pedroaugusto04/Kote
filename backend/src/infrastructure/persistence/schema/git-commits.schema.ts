import { pgTable, uuid, text, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { timestamp } from './column-helpers.js';
import { noteCommitLinkSourceEnum } from './enums.schema.js';
import { users } from './auth.schema.js';
import { notes, projects, workspaces } from './content.schema.js';

export const gitCommits = pgTable('kb_git_commits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  repositoryFullName: text('repository_full_name').notNull().default(''),
  commitSha: text('commit_sha').notNull(),
  parentSha: text('parent_sha').notNull().default(''),
  branch: text('branch').notNull().default(''),
  message: text('message').notNull().default(''),
  authorName: text('author_name').notNull().default(''),
  authorEmail: text('author_email').notNull().default(''),
  committedAt: timestamp('committed_at', { withTimezone: true }).notNull().defaultNow(),
  commitUrl: text('commit_url').notNull().default(''),
  changedFiles: jsonb('changed_files').notNull().default('[]'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userProjectCommitUniqueIdx: uniqueIndex('kb_git_commits_user_project_sha_uidx').on(table.userId, table.projectId, table.commitSha),
  userProjectCommittedAtIdx: index('kb_git_commits_user_project_committed_at_idx').on(table.userId, table.projectId, table.committedAt),
  userCommitShaIdx: index('kb_git_commits_user_sha_idx').on(table.userId, table.commitSha),
}));

export const noteCommitLinks = pgTable('kb_note_commit_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  noteId: uuid('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  commitId: uuid('commit_id').notNull().references(() => gitCommits.id, { onDelete: 'cascade' }),
  linkSource: noteCommitLinkSourceEnum('link_source').notNull().default('manual'),
  matchedFiles: jsonb('matched_files').notNull().default('[]'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  noteCommitUniqueIdx: uniqueIndex('kb_note_commit_links_note_commit_uidx').on(table.noteId, table.commitId),
  userNoteIdx: index('kb_note_commit_links_user_note_idx').on(table.userId, table.noteId),
  userCommitIdx: index('kb_note_commit_links_user_commit_idx').on(table.userId, table.commitId),
}));

export const gitCommitsRelations = relations(gitCommits, ({ one, many }) => ({
  user: one(users, {
    fields: [gitCommits.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [gitCommits.projectId],
    references: [projects.id],
  }),
  workspace: one(workspaces, {
    fields: [gitCommits.workspaceId],
    references: [workspaces.id],
  }),
  noteLinks: many(noteCommitLinks),
}));

export const noteCommitLinksRelations = relations(noteCommitLinks, ({ one }) => ({
  user: one(users, {
    fields: [noteCommitLinks.userId],
    references: [users.id],
  }),
  note: one(notes, {
    fields: [noteCommitLinks.noteId],
    references: [notes.id],
  }),
  commit: one(gitCommits, {
    fields: [noteCommitLinks.commitId],
    references: [gitCommits.id],
  }),
}));

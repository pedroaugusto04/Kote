import { count, sql } from 'drizzle-orm';

import { attachments, categories, notes, projects, workspaces } from '../../persistence/schema/index.js';

export const NOTE_PROJECT_SELECT_COLUMNS = {
  id: notes.id,
  userId: notes.userId,
  path: notes.path,
  title: notes.title,
  projectId: notes.projectId,
  workspaceId: notes.workspaceId,
  projectSlug: projects.projectSlug,
  folderId: notes.folderId,
  status: notes.status,
  tags: notes.tags,
  occurredAt: notes.occurredAt,
  sourceChannel: notes.sourceChannel,
  source: notes.source,
  summary: notes.summary,
  markdownStorageKey: notes.markdownStorageKey,
  metadata: notes.metadata,
  sessionId: notes.sessionId,
  reminderAt: notes.reminderAt,
  isPinned: notes.isPinned,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

export const NOTE_SELECT_COLUMNS = {
  ...NOTE_PROJECT_SELECT_COLUMNS,
  workspaceSlug: workspaces.workspaceSlug,
};

export const NOTE_CATEGORIES_SELECT_COLUMN = sql<unknown[]>`COALESCE(
  json_agg(
    json_build_object(
      'id', ${categories.id},
      'user_id', ${categories.userId},
      'workspace_id', ${categories.workspaceId},
      'name', ${categories.name},
      'color', ${categories.color},
      'icon', ${categories.icon},
      'is_system', ${categories.isSystem},
      'created_at', ${categories.createdAt},
      'updated_at', ${categories.updatedAt}
    )
  ) FILTER (WHERE ${categories.id} IS NOT NULL),
  '[]'::json
)`.as('categories');

export const NOTE_LINKED_COMMITS_SELECT_COLUMN = sql<unknown[]>`COALESCE(
  (
    SELECT json_agg(
      json_build_object(
        'id', gc.id,
        'commit_sha', gc.commit_sha,
        'short_sha', left(gc.commit_sha, 7),
        'message', gc.message,
        'author_name', gc.author_name,
        'committed_at', gc.committed_at,
        'branch', nullif(gc.branch, ''),
        'html_url', nullif(gc.commit_url, ''),
        'link_source', ncl.link_source,
        'matched_files', ncl.matched_files
      )
      ORDER BY gc.committed_at DESC
    )
    FROM kb_note_commit_links ncl
    JOIN kb_git_commits gc ON gc.id = ncl.commit_id
    WHERE ncl.note_id = ${notes.id} AND ncl.user_id = ${notes.userId}
  ),
  '[]'::json
)`.as('linked_commits');

export const NOTE_ATTACHMENT_COUNT_SELECT_COLUMN = count(attachments.id).as('attachment_count');

export const NOTE_BASE_SELECT_FIELDS = {
  ...NOTE_SELECT_COLUMNS,
  categories: NOTE_CATEGORIES_SELECT_COLUMN,
  linkedCommits: NOTE_LINKED_COMMITS_SELECT_COLUMN,
};

export const NOTE_FULL_SELECT_FIELDS = {
  ...NOTE_BASE_SELECT_FIELDS,
  attachmentCount: NOTE_ATTACHMENT_COUNT_SELECT_COLUMN,
};

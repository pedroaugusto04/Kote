import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { ListNotesInput } from '../../application/models/note-list.models.js';
import type { ListProjectKnowledgeMapInput } from '../../application/models/project-knowledge-map.models.js';
import type {
  ListProjectTimelineInput,
  ProjectTimelineFilterCategory,
} from '../../application/models/project-timeline.models.js';
import type { NoteRecord, SaveNoteInput } from '../../application/models/repository-records.models.js';
import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { buildPaginationMeta } from '../../contracts/pagination.js';
import { noteSummary } from '../mappers/content-query.mappers.js';
import { noteFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { buildNoteMutableValues } from './content/note.queries.js';

@Injectable()
export class PostgresNoteRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) {}

  private async hydrateMarkdown(note: NoteRecord): Promise<NoteRecord> {
    return this.contentObjectStorage.hydrateMarkdown(note);
  }

  async list(userId: string) {
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where n.user_id = $1
       group by n.id
       order by n.is_pinned desc, n.occurred_at desc, n.title asc`,
      [userId]
    );
    return result.rows.map(noteFromRow);
  }

  async listPage(userId: string, input: ListNotesInput) {
    const clauses = ['user_id = $1'];
    const values: unknown[] = [userId];

    if (input.workspaceSlug) {
      values.push(input.workspaceSlug);
      clauses.push(`workspace_slug = $${values.length}`);
    }
    if (input.projectSlug) {
      values.push(input.projectSlug);
      clauses.push(`project_slug = $${values.length}`);
    }
    if (input.status) {
      if (input.status === 'open') {
        clauses.push(`lower(status) not in ('resolved', 'archived')`);
      } else {
        values.push(input.status);
        clauses.push(`lower(status) = $${values.length}`);
      }
    }
    if (input.folderId) {
      values.push(input.folderId);
      clauses.push(`folder_id = $${values.length}`);
    }

    const where = clauses.join(' and ');
    const dataWhere = where
      .replace(/\buser_id\b/g, 'n.user_id')
      .replace(/\bworkspace_slug\b/g, 'n.workspace_slug')
      .replace(/\bproject_slug\b/g, 'n.project_slug')
      .replace(/\bfolder_id\b/g, 'n.folder_id');
    const totalResult = await this.database.getPool().query(`select count(*)::int as total from kb_notes where ${where}`, values);
    const total = Number(totalResult.rows[0]?.total || 0);
    const selectedPage = input.selectedId ? await this.resolveNotePage(input, where, values) : input.page;
    const pagination = buildPaginationMeta({ page: selectedPage, pageSize: input.pageSize }, total);
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where ${dataWhere}
       group by n.id
       order by n.is_pinned desc, n.occurred_at desc, n.title asc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
    );

    return { items: result.rows.map((row) => noteSummary(noteFromRow(row))), pagination };
  }

  async listProjectTimeline(userId: string, input: ListProjectTimelineInput) {
    const values: unknown[] = [userId];
    const clauses = ['user_id = $1'];
    if (input.projectSlug) {
      values.push(input.projectSlug);
      clauses.push(`project_slug = $${values.length}`);
    }
    appendTimelineFolderClause(clauses, values, input.folderId, input.folderIds);
    appendTimelineCategoryClause(clauses, input.category);
    if (input.status) {
      if (input.status === 'open') {
        clauses.push(`lower(status) not in ('resolved', 'archived')`);
      } else {
        values.push(input.status);
        clauses.push(`lower(status) = $${values.length}`);
      }
    }
    const where = clauses.join(' and ');
    const dataWhere = where
      .replace(/\buser_id\b/g, 'n.user_id')
      .replace(/\bproject_slug\b/g, 'n.project_slug')
      .replace(/\bfolder_id\b/g, 'n.folder_id')
      .replace(/\btype\b/g, 'n.type')
      .replace(/\bsource_channel\b/g, 'n.source_channel')
      .replace(/\bsource\b/g, 'n.source')
      .replace(/\bstatus\b/g, 'n.status')
      .replace(/\bmetadata\b/g, 'n.metadata');
    const totalResult = await this.database.getPool().query(`select count(*)::int as total from kb_notes where ${where}`, values);
    const total = Number(totalResult.rows[0]?.total || 0);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, total);
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where ${dataWhere}
       group by n.id
       order by n.is_pinned desc, n.occurred_at desc, n.title asc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
    );

    return {
      items: result.rows.map((row) => projectTimelineItem(noteFromRow(row))),
      pagination,
    };
  }

  async listProjectKnowledgeMapItems(userId: string, input: ListProjectKnowledgeMapInput) {
    const values: unknown[] = [userId, input.projectSlug];
    const clauses = ['user_id = $1', 'project_slug = $2'];
    appendTimelineFolderClause(clauses, values, input.folderId, input.folderIds);
    appendTimelineCategoryClause(clauses, input.category);
    const where = clauses.join(' and ');
    const dataWhere = where
      .replace(/\buser_id\b/g, 'n.user_id')
      .replace(/\bproject_slug\b/g, 'n.project_slug')
      .replace(/\bfolder_id\b/g, 'n.folder_id')
      .replace(/\btype\b/g, 'n.type')
      .replace(/\bsource_channel\b/g, 'n.source_channel')
      .replace(/\bsource\b/g, 'n.source')
      .replace(/\bmetadata\b/g, 'n.metadata');
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where ${dataWhere}
       group by n.id
       order by n.is_pinned desc, n.occurred_at desc, n.title asc
       limit $${values.length + 1}`,
      [...values, input.limit]
    );

    return result.rows.map((row) => noteFromRow(row));
  }

  async getById(userId: string, id: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 and id = $2 limit 1', [userId, id]);
    return result.rows[0] ? this.hydrateMarkdown(noteFromRow(result.rows[0])) : null;
  }

  async getByIds(userId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const result = await this.database.getPool().query(
      'select * from kb_notes where user_id = $1 and id = any($2)',
      [userId, ids]
    );
    const notes = result.rows.map(noteFromRow);
    return Promise.all(notes.map((n) => this.hydrateMarkdown(n)));
  }

  async getByPath(userId: string, path: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 and path = $2 limit 1', [userId, path]);
    return result.rows[0] ? noteFromRow(result.rows[0]) : null;
  }

  async getBySourceAndSessionId(userId: string, source: string, sessionId: string) {
    const result = await this.database.getPool().query(
      `select * from kb_notes 
       where user_id = $1 and source = $2 and metadata->>'sessionId' = $3 
       limit 1`,
      [userId, source, sessionId]
    );
    return result.rows[0] ? this.hydrateMarkdown(noteFromRow(result.rows[0])) : null;
  }

  async upsert(userId: string, input: SaveNoteInput) {
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, input);
    const result = await this.database.getPool().query(
      `insert into kb_notes (
         id, user_id, path, type, title, project_slug, workspace_slug, folder_id, status, tags, occurred_at,
         source_channel, summary, markdown_storage_key, frontmatter, metadata, source
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17)
       on conflict (user_id, path)
       do update set
         type = excluded.type,
         title = excluded.title,
         project_slug = excluded.project_slug,
         workspace_slug = excluded.workspace_slug,
         folder_id = excluded.folder_id,
         status = excluded.status,
         tags = excluded.tags,
         occurred_at = excluded.occurred_at,
         source_channel = excluded.source_channel,
         summary = excluded.summary,
         markdown_storage_key = excluded.markdown_storage_key,
         frontmatter = excluded.frontmatter,
         metadata = excluded.metadata,
         source = excluded.source,
         updated_at = now()
      returning *`,
      [input.id || crypto.randomUUID(), userId, ...buildNoteMutableValues(input, markdownStorageKey)]
    );
    return { ...noteFromRow(result.rows[0]), markdown: input.markdown };
  }

  async update(userId: string, input: SaveNoteInput) {
    const existing = await this.getById(userId, String(input.id || ''));
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, input);
    const result = await this.updateWithClient(this.database.getPool(), userId, input, markdownStorageKey);
    if (existing?.markdownStorageKey && existing.markdownStorageKey !== markdownStorageKey) {
      await this.contentObjectStorage.deleteObjects([existing.markdownStorageKey]);
    }
    return { ...noteFromRow(result.rows[0]), markdown: input.markdown };
  }

  async updateReminderStatus(userId: string, id: string, status: string) {
    const result = await this.database.getPool().query(
      `update kb_notes
       set status = $3,
           updated_at = now()
       where user_id = $1 and id = $2
         and (
           coalesce(metadata->>'reminderDate', '') <> ''
           or coalesce(metadata->>'reminderAt', '') <> ''
         )
       returning *`,
      [userId, id, status]
    );
    return result.rows[0] ? noteFromRow(result.rows[0]) : null;
  }

  async setPinned(userId: string, id: string, pinned: boolean) {
    const result = await this.database.getPool().query(
      `update kb_notes
       set is_pinned = $3,
           updated_at = now()
       where user_id = $1 and id = $2
       returning *`,
      [userId, id, pinned]
    );
    return result.rows[0] ? noteFromRow(result.rows[0]) : null;
  }

  async delete(userId: string, id: string, markdownStorageKey: string | null) {
    const result = await this.database.getPool().query('delete from kb_notes where user_id = $1 and id = $2', [userId, id]);
    if ((result.rowCount || 0) === 0) return false;
    if (markdownStorageKey) {
      await this.contentObjectStorage.deleteObjects([markdownStorageKey]);
    }
    return true;
  }

  async updateWithClient(client: Pick<PoolClient, 'query'>, userId: string, input: SaveNoteInput, markdownStorageKey: string) {
    return client.query(
      `update kb_notes
       set path = $3,
           type = $4,
           title = $5,
           project_slug = $6,
           workspace_slug = $7,
           folder_id = $8,
           status = $9,
           tags = $10::jsonb,
           occurred_at = $11,
           source_channel = $12,
           summary = $13,
           markdown_storage_key = $14,
           frontmatter = $15::jsonb,
           metadata = $16::jsonb,
           source = $17,
           updated_at = now()
       where user_id = $1 and id = $2
       returning *`,
      [userId, input.id, ...buildNoteMutableValues(input, markdownStorageKey)]
    );
  }

  private async resolveNotePage(input: ListNotesInput, where: string, values: unknown[]) {
    const selected = await this.database.getPool().query(
      `select occurred_at, title, is_pinned
       from kb_notes
       where ${where} and id = $${values.length + 1}
       limit 1`,
      [...values, input.selectedId]
    );
    const note = selected.rows[0];
    if (!note) return input.page;

    const result = await this.database.getPool().query(
      `select count(*)::int as idx
       from kb_notes
       where ${where}
         and (
           (is_pinned and not $${values.length + 1}::boolean)
           or (is_pinned = $${values.length + 1}::boolean and occurred_at > $${values.length + 2})
           or (is_pinned = $${values.length + 1}::boolean and occurred_at = $${values.length + 2} and title <= $${values.length + 3})
         )`,
      [...values, note.is_pinned, note.occurred_at, note.title]
    );
    const index = Number(result.rows[0]?.idx || 0);
    return index > 0 ? Math.ceil(index / input.pageSize) : 1;
  }
}

function projectTimelineItem(record: NoteRecord) {
  const summary = noteSummary(record);
  return {
    ...summary,
    noteId: record.id,
    category: projectTimelineCategory(record),
    sourceChannel: record.sourceChannel,
  };
}

function projectTimelineCategory(record: Pick<NoteRecord, 'type' | 'metadata' | 'source' | 'sourceChannel'>): ProjectTimelineFilterCategory {
  if (record.type === 'decision') return 'decision';
  if (hasTimelineReminder(record)) return 'reminder';
  if (record.sourceChannel === 'github-push') return 'github-push';
  if (record.sourceChannel === 'whatsapp') return 'whatsapp';
  if (record.sourceChannel === 'ai-chat') return 'ai-chat';
  return 'manual';
}

function hasTimelineReminder(record: Pick<NoteRecord, 'metadata'>) {
  return Boolean(String(record.metadata.reminderDate || '').trim() || String(record.metadata.reminderAt || '').trim());
}

function appendTimelineFolderClause(
  clauses: string[],
  values: unknown[],
  folderId: ListProjectTimelineInput['folderId'],
  folderIds: ListProjectTimelineInput['folderIds'],
) {
  if (folderIds && folderIds.length > 0) {
    const placeholders = folderIds.map((id) => {
      values.push(id);
      return `$${values.length}`;
    });
    clauses.push(`folder_id in (${placeholders.join(', ')})`);
    return;
  }
  if (folderId === undefined) return;
  const normalizedFolderId = folderId.trim();
  if (!normalizedFolderId) return;
  values.push(normalizedFolderId);
  clauses.push(`folder_id = $${values.length}`);
}

function appendTimelineCategoryClause(clauses: string[], category: ListProjectTimelineInput['category']) {
  const notDecision = "type <> 'decision'";
  const noReminder = "(coalesce(metadata->>'reminderDate', '') = '' and coalesce(metadata->>'reminderAt', '') = '')";
  if (category === 'all') return;
  if (category === 'decision') {
    clauses.push("type = 'decision'");
    return;
  }
  if (category === 'reminder') {
    clauses.push(notDecision);
    clauses.push("(coalesce(metadata->>'reminderDate', '') <> '' or coalesce(metadata->>'reminderAt', '') <> '')");
    return;
  }
  clauses.push(notDecision);
  clauses.push(noReminder);
  if (category === 'github-push') {
    clauses.push("source_channel = 'github-push'");
    return;
  }
  if (category === 'whatsapp') {
    clauses.push("source_channel = 'whatsapp'");
    return;
  }
  if (category === 'ai-chat') {
    clauses.push("source_channel = 'ai-chat'");
    return;
  }
  clauses.push("source_channel <> 'github-push'");
  clauses.push("source_channel <> 'whatsapp'");
  clauses.push("source_channel <> 'ai-chat'");
  clauses.push("(metadata->>'manual' = 'true' or source = 'manual-api')");
}

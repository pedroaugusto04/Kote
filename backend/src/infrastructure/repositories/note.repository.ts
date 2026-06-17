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
    const clauses = ['n.user_id = $1'];
    const values: unknown[] = [userId];

    if (input.workspaceSlug) {
      values.push(input.workspaceSlug);
      clauses.push(`n.workspace_slug = $${values.length}`);
    }
    if (input.projectSlug) {
      values.push(input.projectSlug);
      clauses.push(`n.project_slug = $${values.length}`);
    }
    if (input.status) {
      if (input.status === 'open') {
        clauses.push(`n.status not in ('resolved', 'archived')`);
      } else {
        values.push(input.status);
        clauses.push(`n.status::text = $${values.length}`);
      }
    }
    if (input.folderId) {
      values.push(input.folderId);
      clauses.push(`n.folder_id = $${values.length}`);
    }

    const where = clauses.join(' and ');
    const totalResult = await this.database.getPool().query(`select count(*)::int as total from kb_notes n where ${where}`, values);
    const total = Number(totalResult.rows[0]?.total || 0);
    const selectedPage = input.selectedId ? await this.resolveNotePage(input, where, values) : input.page;
    const pagination = buildPaginationMeta({ page: selectedPage, pageSize: input.pageSize }, total);
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where ${where}
       group by n.id
       order by n.is_pinned desc, n.occurred_at desc, n.title asc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
    );

    return { items: result.rows.map((row) => noteSummary(noteFromRow(row))), pagination };
  }

  async listProjectTimeline(userId: string, input: ListProjectTimelineInput) {
    const values: unknown[] = [userId];
    const clauses = ['n.user_id = $1'];
    if (input.projectSlug) {
      values.push(input.projectSlug);
      clauses.push(`n.project_slug = $${values.length}`);
    }
    appendTimelineFolderClause(clauses, values, input.folderId, input.folderIds);
    appendTimelineCategoryClause(clauses, input.category);
    if (input.status) {
      if (input.status === 'open') {
        clauses.push(`n.status not in ('resolved', 'archived')`);
      } else {
        values.push(input.status);
        clauses.push(`n.status::text = $${values.length}`);
      }
    }
    const where = clauses.join(' and ');
    const totalResult = await this.database.getPool().query(`select count(*)::int as total from kb_notes n where ${where}`, values);
    const total = Number(totalResult.rows[0]?.total || 0);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, total);
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where ${where}
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
    const clauses = ['n.user_id = $1', 'n.project_slug = $2'];
    appendTimelineFolderClause(clauses, values, input.folderId, input.folderIds);
    appendTimelineCategoryClause(clauses, input.category);
    const where = clauses.join(' and ');
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where ${where}
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

  async getBySourceAndSessionId(userId: string, source: string, sessionId: string) {
    const result = await this.database.getPool().query(
      `select * from kb_notes
       where user_id = $1 and source = $2 and session_id = $3
       limit 1`,
      [userId, source, sessionId]
    );
    return result.rows[0] ? this.hydrateMarkdown(noteFromRow(result.rows[0])) : null;
  }

  async upsert(userId: string, input: SaveNoteInput) {
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, input);
    
    // If an existing note ID is provided, update it directly
    if (input.id) {
      const existing = await this.getById(userId, input.id);
      if (existing) {
        return this.update(userId, input);
      }
    }
    
    // Otherwise insert new note (deduplication is handled by use case via source + session_id)
    const result = await this.database.getPool().query(
      `insert into kb_notes (
         id, user_id, path, type, title, project_slug, workspace_slug, folder_id, status, tags, occurred_at,
         source_channel, summary, markdown_storage_key, frontmatter, metadata, source,
         session_id, reminder_date, reminder_at
       )
       values ($1, $2, $3, $4::note_type_enum, $5, $6, $7, $8, $9::note_status_enum, $10::jsonb, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17, $18, $19, $20)
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
         and (reminder_date <> '' or reminder_at <> '')
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
           type = $4::note_type_enum,
           title = $5,
           project_slug = $6,
           workspace_slug = $7,
           folder_id = $8,
           status = $9::note_status_enum,
           tags = $10::jsonb,
           occurred_at = $11,
           source_channel = $12,
           summary = $13,
           markdown_storage_key = $14,
           frontmatter = $15::jsonb,
           metadata = $16::jsonb,
           source = $17,
           session_id = $18,
           reminder_date = $19,
           reminder_at = $20,
           updated_at = now()
       where user_id = $1 and id = $2
       returning *`,
      [userId, input.id, ...buildNoteMutableValues(input, markdownStorageKey)]
    );
  }

  private async resolveNotePage(input: ListNotesInput, where: string, values: unknown[]) {
    const selected = await this.database.getPool().query(
      `select occurred_at, title, is_pinned
       from kb_notes n
       where ${where} and n.id = $${values.length + 1}
       limit 1`,
      [...values, input.selectedId]
    );
    const note = selected.rows[0];
    if (!note) return input.page;

    const result = await this.database.getPool().query(
      `select count(*)::int as idx
       from kb_notes n
       where ${where}
         and (
           (n.is_pinned and not $${values.length + 1}::boolean)
           or (n.is_pinned = $${values.length + 1}::boolean and n.occurred_at > $${values.length + 2})
           or (n.is_pinned = $${values.length + 1}::boolean and n.occurred_at = $${values.length + 2} and n.title <= $${values.length + 3})
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

function projectTimelineCategory(record: Pick<NoteRecord, 'type' | 'metadata' | 'source' | 'sourceChannel' | 'reminderDate' | 'reminderAt'>): ProjectTimelineFilterCategory {
  if (record.type === 'decision') return 'decision';
  if (hasTimelineReminder(record)) return 'reminder';
  if (record.sourceChannel === 'github-push') return 'github-push';
  if (record.sourceChannel === 'whatsapp') return 'whatsapp';
  if (record.sourceChannel === 'ai-chat') return 'ai-chat';
  return 'manual';
}

function hasTimelineReminder(record: Pick<NoteRecord, 'reminderDate' | 'reminderAt'>) {
  return Boolean(record.reminderDate.trim() || record.reminderAt.trim());
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
    clauses.push(`n.folder_id in (${placeholders.join(', ')})`);
    return;
  }
  if (folderId === undefined) return;
  const normalizedFolderId = folderId.trim();
  if (!normalizedFolderId) return;
  values.push(normalizedFolderId);
  clauses.push(`n.folder_id = $${values.length}`);
}

function appendTimelineCategoryClause(clauses: string[], category: ListProjectTimelineInput['category']) {
  const notDecision = "n.type <> 'decision'";
  const noReminder = "(n.reminder_date = '' and n.reminder_at = '')";
  if (category === 'all') return;
  if (category === 'decision') {
    clauses.push("n.type = 'decision'");
    return;
  }
  if (category === 'reminder') {
    clauses.push(notDecision);
    clauses.push("(n.reminder_date <> '' or n.reminder_at <> '')");
    return;
  }
  clauses.push(notDecision);
  clauses.push(noReminder);
  if (category === 'github-push') {
    clauses.push("n.source_channel = 'github-push'");
    return;
  }
  if (category === 'whatsapp') {
    clauses.push("n.source_channel = 'whatsapp'");
    return;
  }
  if (category === 'ai-chat') {
    clauses.push("n.source_channel = 'ai-chat'");
    return;
  }
  clauses.push("n.source_channel <> 'github-push'");
  clauses.push("n.source_channel <> 'whatsapp'");
  clauses.push("n.source_channel <> 'ai-chat'");
  clauses.push("n.source = 'manual-api'");
}

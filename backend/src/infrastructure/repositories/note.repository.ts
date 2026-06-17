import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { eq, and, count, desc, sql, inArray, notInArray } from 'drizzle-orm';

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
import { notes, attachments, noteTypeEnum, noteStatusEnum } from '../persistence/schema/index.js';

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
    const db = this.database.getDb();
    const result = await db
      .select({
        id: notes.id,
        userId: notes.userId,
        path: notes.path,
        type: notes.type,
        title: notes.title,
        projectSlug: notes.projectSlug,
        workspaceSlug: notes.workspaceSlug,
        folderId: notes.folderId,
        status: notes.status,
        tags: notes.tags,
        occurredAt: notes.occurredAt,
        sourceChannel: notes.sourceChannel,
        summary: notes.summary,
        markdownStorageKey: notes.markdownStorageKey,
        frontmatter: notes.frontmatter,
        metadata: notes.metadata,
        sessionId: notes.sessionId,
        reminderDate: notes.reminderDate,
        reminderAt: notes.reminderAt,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        attachmentCount: count(attachments.id).as('attachment_count'),
      })
      .from(notes)
      .leftJoin(attachments, and(
        eq(attachments.userId, notes.userId),
        eq(attachments.noteId, notes.id)
      ))
      .where(eq(notes.userId, userId))
      .groupBy(notes.id)
      .orderBy(desc(notes.isPinned), desc(notes.occurredAt), notes.title);
    
    return result.map(noteFromRow);
  }

  async listPage(userId: string, input: ListNotesInput) {
    const db = this.database.getDb();
    const conditions = [eq(notes.userId, userId)];

    if (input.workspaceSlug) {
      conditions.push(eq(notes.workspaceSlug, input.workspaceSlug));
    }
    if (input.projectSlug) {
      conditions.push(eq(notes.projectSlug, input.projectSlug));
    }
    if (input.status) {
      if (input.status === 'open') {
        conditions.push(notInArray(notes.status, ['resolved', 'archived']));
      } else {
        conditions.push(eq(notes.status, input.status as 'active' | 'pending' | 'resolved' | 'archived' | 'sent' | 'overdue'));
      }
    }
    if (input.folderId) {
      conditions.push(eq(notes.folderId, input.folderId));
    }

    const whereCondition = and(...conditions);
    
    const totalResult = await db
      .select({ total: count() })
      .from(notes)
      .where(whereCondition);
    
    const total = Number(totalResult[0]?.total || 0);
    const selectedPage = input.selectedId ? await this.resolveNotePage(input, whereCondition) : input.page;
    const pagination = buildPaginationMeta({ page: selectedPage, pageSize: input.pageSize }, total);
    
    const result = await db
      .select({
        id: notes.id,
        userId: notes.userId,
        path: notes.path,
        type: notes.type,
        title: notes.title,
        projectSlug: notes.projectSlug,
        workspaceSlug: notes.workspaceSlug,
        folderId: notes.folderId,
        status: notes.status,
        tags: notes.tags,
        occurredAt: notes.occurredAt,
        sourceChannel: notes.sourceChannel,
        summary: notes.summary,
        markdownStorageKey: notes.markdownStorageKey,
        frontmatter: notes.frontmatter,
        metadata: notes.metadata,
        sessionId: notes.sessionId,
        reminderDate: notes.reminderDate,
        reminderAt: notes.reminderAt,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        attachmentCount: count(attachments.id).as('attachment_count'),
      })
      .from(notes)
      .leftJoin(attachments, and(
        eq(attachments.userId, notes.userId),
        eq(attachments.noteId, notes.id)
      ))
      .where(whereCondition)
      .groupBy(notes.id)
      .orderBy(desc(notes.isPinned), desc(notes.occurredAt), notes.title)
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize);

    return { items: result.map((row) => noteSummary(noteFromRow(row))), pagination };
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
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .limit(1);
    
    return result[0] ? this.hydrateMarkdown(noteFromRow(result[0])) : null;
  }

  async getByIds(userId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), inArray(notes.id, ids)));
    
    const noteRecords = result.map(noteFromRow);
    return Promise.all(noteRecords.map((n) => this.hydrateMarkdown(n)));
  }

  async getBySourceAndSessionId(userId: string, source: string, sessionId: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(notes)
      .where(and(
        eq(notes.userId, userId),
        eq(notes.sourceChannel, source),
        eq(notes.sessionId, sessionId)
      ))
      .limit(1);
    
    return result[0] ? this.hydrateMarkdown(noteFromRow(result[0])) : null;
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
    const db = this.database.getDb();
    const result = await db
      .insert(notes)
      .values({
        id: crypto.randomUUID(),
        userId,
        path: input.path,
        type: input.type as 'event' | 'decision' | 'knowledge' | 'incident' | 'followup',
        title: input.title,
        projectSlug: input.projectSlug,
        workspaceSlug: input.workspaceSlug,
        folderId: input.folderId,
        status: input.status as 'active' | 'pending' | 'resolved' | 'archived' | 'sent' | 'overdue',
        tags: input.tags,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        sourceChannel: input.sourceChannel,
        summary: input.summary,
        markdownStorageKey,
        frontmatter: input.frontmatter,
        metadata: input.metadata,
        source: input.source,
        sessionId: input.sessionId ?? '',
        reminderDate: input.reminderDate ?? '',
        reminderAt: input.reminderAt ?? '',
      } as typeof notes.$inferInsert)
      .returning();
    
    return this.hydrateMarkdown(noteFromRow(result[0]));
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
    const db = this.database.getDb();
    const result = await db
      .update(notes)
      .set({ status: status as 'active' | 'pending' | 'resolved' | 'archived' | 'sent' | 'overdue', updatedAt: new Date() })
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .returning();
    
    return result[0] ? noteFromRow(result[0]) : null;
  }

  async setPinned(userId: string, id: string, pinned: boolean) {
    const db = this.database.getDb();
    const result = await db
      .update(notes)
      .set({ isPinned: pinned, updatedAt: new Date() })
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .returning();
    
    return result[0] ? noteFromRow(result[0]) : null;
  }

  async delete(userId: string, id: string, markdownStorageKey: string | null) {
    const db = this.database.getDb();
    const result = await db
      .delete(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .returning();
    
    if (result.length === 0) return false;
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
      [
        userId,
        input.id,
        input.path,
        input.type,
        input.title,
        input.projectSlug,
        input.workspaceSlug,
        input.folderId,
        input.status,
        JSON.stringify(input.tags),
        input.occurredAt,
        input.sourceChannel,
        input.summary,
        markdownStorageKey,
        JSON.stringify(input.frontmatter),
        JSON.stringify(input.metadata),
        input.source,
        input.sessionId ?? '',
        input.reminderDate ?? '',
        input.reminderAt ?? '',
      ]
    );
  }

  private async resolveNotePage(input: ListNotesInput, whereCondition: any) {
    const db = this.database.getDb();
    const selected = await db
      .select({
        occurredAt: notes.occurredAt,
        title: notes.title,
        isPinned: notes.isPinned,
      })
      .from(notes)
      .where(and(whereCondition, eq(notes.id, input.selectedId || '')))
      .limit(1);
    
    const note = selected[0];
    if (!note) return input.page;

    const result = await db
      .select({ idx: count() })
      .from(notes)
      .where(and(
        whereCondition,
        sql`(
          (${notes.isPinned} = true and ${note.isPinned} = false)
          or (${notes.isPinned} = ${note.isPinned} and ${notes.occurredAt} > ${note.occurredAt})
          or (${notes.isPinned} = ${note.isPinned} and ${notes.occurredAt} = ${note.occurredAt} and ${notes.title} <= ${note.title})
        )`
      ));
    
    const index = Number(result[0]?.idx || 0);
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

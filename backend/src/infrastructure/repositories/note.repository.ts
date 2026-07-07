import crypto from 'node:crypto';

import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { eq, and, count, desc, sql, inArray, notInArray, or, gte, type SQL } from 'drizzle-orm';


import type { ListNotesInput } from '../../application/models/note-list.models.js';
import type { ListProjectKnowledgeMapInput } from '../../application/models/project-knowledge-map.models.js';
import type {
  ListProjectTimelineInput,
  ProjectTimelineFilterCategory,
} from '../../application/models/project-timeline.models.js';
import type { NoteRecord, SaveNoteInput } from '../../application/models/repository-records.models.js';
import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { buildPaginationMeta } from '../../contracts/pagination.js';
import { StatusFilter, terminalStatuses } from '../../contracts/status-filters.js';
import { SourceChannel, TimelineCategory } from '../../contracts/enums.js';
import { noteSummary } from '../mappers/content-query.mappers.js';
import { noteFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { notes, attachments, NoteStatus, projects, workspaces, categories, noteCategories, askHistory } from '../persistence/schema/index.js';
import { resolveIds } from './utils/id-resolution.helpers.js';
import { isAiSource } from '../../domain/notes.js';
import { resolveNoteBodySearchText } from '../../domain/utils/note-search-text.utils.js';
import type { ProductivityInsightsRaw } from '../../application/models/productivity.models.js';


@Injectable()
export class PostgresNoteRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) { }

  private async hydrateMarkdown(note: NoteRecord): Promise<NoteRecord> {
    return this.contentObjectStorage.hydrateMarkdown(note);
  }

  async list(userId: string, filters?: { projectId?: string; workspaceId?: string }) {
    const db = this.database.getDb();
    const conditions = [eq(notes.userId, userId)];

    if (filters?.workspaceId) {
      conditions.push(eq(notes.workspaceId, filters.workspaceId));
    }
    if (filters?.projectId) {
      conditions.push(eq(notes.projectId, filters.projectId));
    }

    const result = await db
      .select({
        id: notes.id,
        userId: notes.userId,
        path: notes.path,
        title: notes.title,
        projectId: notes.projectId,
        workspaceId: notes.workspaceId,
        workspaceSlug: workspaces.workspaceSlug,
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
        attachmentCount: count(attachments.id).as('attachment_count'),
        categories: sql<unknown[]>`COALESCE(
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
        )`.as('categories'),
      })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(workspaces, eq(workspaces.id, notes.workspaceId))
      .leftJoin(attachments, and(
        eq(attachments.userId, notes.userId),
        eq(attachments.noteId, notes.id)
      ))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(and(...conditions))
      .groupBy(notes.id, projects.projectSlug, workspaces.workspaceSlug)
      .orderBy(desc(notes.isPinned), desc(notes.occurredAt), notes.title);

    return result.map(noteFromRow);
  }

  async listPage(userId: string, input: ListNotesInput) {
    const db = this.database.getDb();
    const conditions = [eq(notes.userId, userId)];

    if (input.workspaceId) {
      conditions.push(eq(notes.workspaceId, input.workspaceId));
    } else if (input.workspaceSlug) {
      const wsResult = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.userId, userId), eq(workspaces.workspaceSlug, input.workspaceSlug)))
        .limit(1);
      if (wsResult.length > 0) {
        conditions.push(eq(notes.workspaceId, wsResult[0].id));
      } else {
        return { items: [], pagination: buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, 0) };
      }
    }
    if (input.projectId) {
      conditions.push(eq(notes.projectId, input.projectId));
    } else if (input.projectSlug) {
      const projResult = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.userId, userId), eq(projects.projectSlug, input.projectSlug)))
        .limit(1);
      if (projResult.length > 0) {
        conditions.push(eq(notes.projectId, projResult[0].id));
      } else {
        return { items: [], pagination: buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, 0) };
      }
    }
    if (input.status) {
      if (input.status === StatusFilter.Open) {
        conditions.push(notInArray(notes.status, [...terminalStatuses]));
      } else {
        conditions.push(eq(notes.status, input.status as NoteStatus));
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
        title: notes.title,
        projectId: notes.projectId,
        workspaceId: notes.workspaceId,
        workspaceSlug: workspaces.workspaceSlug,
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
        attachmentCount: count(attachments.id).as('attachment_count'),
        categories: sql<unknown[]>`COALESCE(
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
        )`.as('categories'),
      })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(workspaces, eq(workspaces.id, notes.workspaceId))
      .leftJoin(attachments, and(
        eq(attachments.userId, notes.userId),
        eq(attachments.noteId, notes.id)
      ))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(whereCondition)
      .groupBy(notes.id, projects.projectSlug, workspaces.workspaceSlug)
      .orderBy(desc(notes.isPinned), desc(notes.occurredAt), notes.title)
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize);

    return { items: result.map((row) => noteSummary(noteFromRow(row))), pagination };
  }

  async listProjectTimeline(userId: string, input: ListProjectTimelineInput) {
    const values: unknown[] = [userId];
    const clauses = ['n.user_id = $1'];

    const joinSql = `
      left join kb_projects p on p.id = n.project_id
    `;

    if (input.projectId) {
      values.push(input.projectId);
      clauses.push(`n.project_id = $${values.length}`);
    }

    appendTimelineFolderClause(clauses, values, input.folderId, input.folderIds);
    appendTimelineCategoryClause(clauses, input.category);
    if (input.status) {
      if (input.status === StatusFilter.Open) {
        values.push(terminalStatuses);
        clauses.push(`n.status != all($${values.length}::note_status_enum[])`);
      } else {
        values.push(input.status);
        clauses.push(`n.status::text = $${values.length}`);
      }
    }
    const where = clauses.join(' and ');
    const totalResult = await this.database.getPool().query(
      `select count(*)::int as total 
       from kb_notes n 
       ${joinSql}
       where ${where}`,
      values
    );
    const total = Number(totalResult.rows[0]?.total || 0);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, total);

    const result = await this.database.getPool().query(
      `select n.*, count(distinct a.id)::int as attachment_count,
              coalesce(
                json_agg(
                  json_build_object(
                    'id', cat.id,
                    'user_id', cat.user_id,
                    'workspace_id', cat.workspace_id,
                    'name', cat.name,
                    'color', cat.color,
                    'icon', cat.icon,
                    'is_system', cat.is_system,
                    'created_at', cat.created_at,
                    'updated_at', cat.updated_at
                  )
                ) filter (where cat.id is not null),
                '[]'::json
              ) as categories
       from kb_notes n
       ${joinSql}
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       left join kb_note_categories nc on nc.note_id = n.id
       left join kb_categories cat on cat.id = nc.category_id
       where ${where}
       group by n.id
       order by ${(input.orderByPin ?? true) ? 'n.is_pinned desc, ' : ''}n.occurred_at desc, n.title asc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
    );

    return {
      items: result.rows.map((row) => projectTimelineItem(noteFromRow(row))),
      pagination,
    };
  }

  async listProjectKnowledgeMapItems(userId: string, input: ListProjectKnowledgeMapInput) {
    const values: unknown[] = [userId];
    const clauses = ['n.user_id = $1'];
    if (input.projectId) {
      values.push(input.projectId);
      clauses.push(`n.project_id = $${values.length}`);
    }
    appendTimelineFolderClause(clauses, values, input.folderId, input.folderIds);
    appendTimelineCategoryClause(clauses, input.category);
    const where = clauses.join(' and ');

    const result = await this.database.getPool().query(
      `select n.*, count(distinct a.id)::int as attachment_count,
              coalesce(
                json_agg(
                  json_build_object(
                    'id', cat.id,
                    'user_id', cat.user_id,
                    'workspace_id', cat.workspace_id,
                    'name', cat.name,
                    'color', cat.color,
                    'icon', cat.icon,
                    'is_system', cat.is_system,
                    'created_at', cat.created_at,
                    'updated_at', cat.updated_at
                  )
                ) filter (where cat.id is not null),
                '[]'::json
              ) as categories
       from kb_notes n
       left join kb_projects p on p.id = n.project_id
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       left join kb_note_categories nc on nc.note_id = n.id
       left join kb_categories cat on cat.id = nc.category_id
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
      .select({
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
        categories: sql<unknown[]>`COALESCE(
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
        )`.as('categories'),
      })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .groupBy(notes.id, projects.projectSlug)
      .limit(1);

    return result[0] ? this.hydrateMarkdown(noteFromRow(result[0])) : null;
  }

  async getByPath(userId: string, path: string) {
    const db = this.database.getDb();
    const result = await db
      .select({
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
        categories: sql<unknown[]>`COALESCE(
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
        )`.as('categories'),
      })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(and(eq(notes.userId, userId), eq(notes.path, path)))
      .groupBy(notes.id, projects.projectSlug)
      .limit(1);

    return result[0] ? this.hydrateMarkdown(noteFromRow(result[0])) : null;
  }

  async getByIds(userId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const db = this.database.getDb();
    const result = await db
      .select({
        id: notes.id,
        userId: notes.userId,
        path: notes.path,
        title: notes.title,
        projectId: notes.projectId,
        workspaceId: notes.workspaceId,
        workspaceSlug: workspaces.workspaceSlug,
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
        categories: sql<unknown[]>`COALESCE(
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
        )`.as('categories'),
      })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(workspaces, eq(workspaces.id, notes.workspaceId))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(and(eq(notes.userId, userId), inArray(notes.id, ids)))
      .groupBy(notes.id, projects.projectSlug, workspaces.workspaceSlug);

    const noteRecords = result.map(noteFromRow);
    return Promise.all(noteRecords.map((n) => this.hydrateMarkdown(n)));
  }

  async getBySourceAndSessionId(userId: string, source: string, sessionId: string) {
    const db = this.database.getDb();
    const result = await db
      .select({
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
        categories: sql<unknown[]>`COALESCE(
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
        )`.as('categories'),
      })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(and(
        eq(notes.userId, userId),
        eq(notes.source, source),
        eq(notes.sessionId, sessionId)
      ))
      .groupBy(notes.id, projects.projectSlug)
      .limit(1);

    return result[0] ? this.hydrateMarkdown(noteFromRow(result[0])) : null;
  }

  async upsert(userId: string, input: SaveNoteInput) {
    let existingId = input.id;
    if (!existingId && input.path) {
      const db = this.database.getDb();
      const existing = await db
        .select({ id: notes.id })
        .from(notes)
        .where(and(eq(notes.userId, userId), eq(notes.path, input.path)))
        .limit(1);
      if (existing.length > 0) {
        existingId = existing[0].id;
      }
    }

    const noteId = existingId || input.id || crypto.randomUUID();
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, { ...input, id: noteId });
    const bodySearchText = resolveNoteBodySearchText(input.markdown, input.metadata);

    if (existingId) {
      const existing = await this.getById(userId, existingId);
      if (existing) {
        await this.updateWithClient(this.database.getDb(), userId, { ...input, id: existingId }, markdownStorageKey);
        if (existing.markdownStorageKey && existing.markdownStorageKey !== markdownStorageKey) {
          await this.contentObjectStorage.deleteObjects([existing.markdownStorageKey]);
        }
        const updated = await this.getById(userId, existingId);
        if (!updated) {
          throw new InternalServerErrorException('note_not_found');
        }
        return updated;
      }
    }

    const db = this.database.getDb();
    const { projectId, workspaceId } = await resolveIds(this.database, userId, input.projectSlug ?? null, input.workspaceSlug ?? 'default');

    const categoryIds = input.categoryIds || [];

    await db
      .insert(notes)
      .values({
        id: noteId,
        userId,
        path: input.path,
        title: input.title,
        projectId,
        workspaceId,
        folderId: input.folderId,
        status: input.status as NoteStatus,
        tags: input.tags,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        sourceChannel: input.sourceChannel,
        summary: input.summary,
        bodySearchText,
        markdownStorageKey,
        metadata: input.metadata,
        source: input.source,
        sessionId: input.sessionId ?? '',
        reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
        sizeBytes: input.sizeBytes ?? (input.markdown ? Buffer.byteLength(input.markdown, 'utf8') : 0),
      } as typeof notes.$inferInsert);

    if (categoryIds.length > 0) {
      await db.insert(noteCategories).values(
        categoryIds.map((catId) => ({
          noteId,
          categoryId: catId,
        }))
      );
    }

    const created = await this.getById(userId, noteId);
    if (!created) {
      throw new InternalServerErrorException('note_not_found');
    }
    return created;
  }

  async update(userId: string, input: SaveNoteInput) {
    const existing = await this.getById(userId, String(input.id || ''));
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, input);
    await this.updateWithClient(this.database.getDb(), userId, input, markdownStorageKey);
    if (existing?.markdownStorageKey && existing.markdownStorageKey !== markdownStorageKey) {
      await this.contentObjectStorage.deleteObjects([existing.markdownStorageKey]);
    }
    const updated = await this.getById(userId, String(input.id || ''));
    if (!updated) {
      throw new InternalServerErrorException('note_not_found');
    }
    return updated;
  }

  async updateReminderStatus(userId: string, id: string, status: string) {
    const db = this.database.getDb();
    const result = await db
      .update(notes)
      .set({ status: status as NoteStatus, updatedAt: new Date() })
      .where(and(
        eq(notes.userId, userId),
        eq(notes.id, id),
        sql`${notes.reminderAt} IS NOT NULL`
      ))
      .returning();

    if (result.length === 0) return null;
    return this.getById(userId, id);
  }

  async updateStatuses(userId: string, ids: string[], status: string) {
    if (ids.length === 0) return;
    const db = this.database.getDb();
    await db
      .update(notes)
      .set({ status: status as NoteStatus, updatedAt: new Date() })
      .where(and(
        eq(notes.userId, userId),
        inArray(notes.id, ids)
      ));
  }

  async updateReminderStatuses(userId: string, ids: string[], status: string) {
    if (ids.length === 0) return;
    const db = this.database.getDb();
    await db
      .update(notes)
      .set({ status: status as NoteStatus, updatedAt: new Date() })
      .where(and(
        eq(notes.userId, userId),
        inArray(notes.id, ids),
        sql`${notes.reminderAt} IS NOT NULL`
      ));
  }

  async setPinned(userId: string, id: string, pinned: boolean) {
    const db = this.database.getDb();
    await db
      .update(notes)
      .set({ isPinned: pinned, updatedAt: new Date() })
      .where(and(eq(notes.userId, userId), eq(notes.id, id)));

    return this.getById(userId, id);
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

  async updateWithClient(dbOrTx: any, userId: string, input: SaveNoteInput, markdownStorageKey: string) {
    let projectId = input.projectId;
    let workspaceId = input.workspaceId;
    
    if ((!projectId && input.projectSlug) || (!workspaceId && input.workspaceSlug)) {
      const wsResult = await dbOrTx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.userId, userId), eq(workspaces.workspaceSlug, input.workspaceSlug || 'default')))
        .limit(1);
      if (wsResult.length === 0) {
        throw new NotFoundException('workspace_not_found');
      }
      workspaceId = wsResult[0].id;

      if (input.projectSlug) {
        const projResult = await dbOrTx
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.userId, userId), eq(projects.projectSlug, input.projectSlug)))
          .limit(1);
        if (projResult.length > 0) {
          projectId = projResult[0].id;
        }
      }
    }

    const updateResult = await dbOrTx
      .update(notes)
      .set({
        path: input.path,
        title: input.title,
        projectId: projectId || null,
        workspaceId: workspaceId!,
        folderId: input.folderId,
        status: input.status as NoteStatus,
        tags: input.tags,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        sourceChannel: input.sourceChannel,
        summary: input.summary,
        bodySearchText: resolveNoteBodySearchText(input.markdown, input.metadata),
        markdownStorageKey,
        metadata: input.metadata,
        source: input.source,
        sessionId: input.sessionId ?? '',
        reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
        sizeBytes: input.sizeBytes ?? (input.markdown ? Buffer.byteLength(input.markdown, 'utf8') : 0),
        updatedAt: new Date(),
      })
      .where(and(eq(notes.userId, userId), eq(notes.id, input.id!)))
      .returning();

    if (input.categoryIds) {
      await dbOrTx
        .delete(noteCategories)
        .where(eq(noteCategories.noteId, input.id!));
      
      if (input.categoryIds.length > 0) {
        await dbOrTx
          .insert(noteCategories)
          .values(
            input.categoryIds.map((catId) => ({
              noteId: input.id!,
              categoryId: catId,
            }))
          )
          .onConflictDoNothing();
      }
    }
    return { rows: updateResult };
  }

  async updateBodySearchText(userId: string, noteId: string, bodySearchText: string) {
    await this.database.getDb()
      .update(notes)
      .set({
        bodySearchText,
        updatedAt: new Date(),
      })
      .where(and(eq(notes.userId, userId), eq(notes.id, noteId)));
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

  async getNoteNeighbors(userId: string, noteId: string, input?: { projectId?: string; workspaceId?: string; folderId?: string; status?: string }) {
    const conditions: string[] = ['n.user_id = $1'];
    const values: unknown[] = [userId];

    if (input?.projectId) {
      values.push(input.projectId);
      conditions.push(`n.project_id = $${values.length}`);
    } else {
      conditions.push('n.project_id IS NULL');
    }
    if (input?.workspaceId) {
      values.push(input.workspaceId);
      conditions.push(`n.workspace_id = $${values.length}`);
    }
    if (input?.folderId) {
      values.push(input.folderId);
      conditions.push(`n.folder_id = $${values.length}`);
    }
    if (input?.status) {
      values.push(input.status);
      conditions.push(`n.status = $${values.length}`);
    }

    const where = conditions.join(' AND ');
    values.push(noteId);
    const targetParam = `$${values.length}`;

    const result = await this.database.getPool().query<{
      previous_id: string | null;
      previous_title: string | null;
      next_id: string | null;
      next_title: string | null;
    }>(
      `WITH ordered AS (
        SELECT
          n.id,
          n.title,
          LAG(n.id) OVER w AS previous_id,
          LAG(n.title) OVER w AS previous_title,
          LEAD(n.id) OVER w AS next_id,
          LEAD(n.title) OVER w AS next_title
        FROM kb_notes n
        WHERE ${where}
        WINDOW w AS (ORDER BY n.is_pinned DESC, n.occurred_at DESC, n.title ASC)
      )
      SELECT previous_id, previous_title, next_id, next_title
      FROM ordered
      WHERE id = ${targetParam}`,
      values,
    );

    const row = result.rows[0];
    return {
      previous: row?.previous_id ? { id: row.previous_id, title: row.previous_title ?? '' } : null,
      next: row?.next_id ? { id: row.next_id, title: row.next_title ?? '' } : null,
    };
  }

  async getProductivityInsightsRaw(userId: string): Promise<ProductivityInsightsRaw> {
    const db = this.database.getDb();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [dbNotes, dbAsks] = await Promise.all([
      db
        .select({
          createdAt: notes.createdAt,
          sourceChannel: notes.sourceChannel,
          source: notes.source,
        })
        .from(notes)
        .where(and(eq(notes.userId, userId), gte(notes.createdAt, ninetyDaysAgo))),
      db
        .select({
          createdAt: askHistory.createdAt,
        })
        .from(askHistory)
        .where(and(eq(askHistory.userId, userId), gte(askHistory.createdAt, ninetyDaysAgo))),
    ]);

    const activities = [
      ...dbNotes.map((n) => ({
        createdAt: n.createdAt.toISOString(),
        type: 'note' as const,
        isAi: n.sourceChannel === 'ai-chat' || isAiSource(n.source),
      })),
      ...dbAsks.map((a) => ({
        createdAt: a.createdAt.toISOString(),
        type: 'ask' as const,
        isAi: true,
      })),
    ];

    return {
      activities,
    };
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

function projectTimelineCategory(record: Pick<NoteRecord, 'metadata' | 'source' | 'sourceChannel' | 'reminderAt'>): ProjectTimelineFilterCategory {
  if (hasTimelineReminder(record)) return TimelineCategory.Reminder;
  if (record.sourceChannel === SourceChannel.Github || record.sourceChannel === 'github-push') return TimelineCategory.Github;
  if (record.sourceChannel === SourceChannel.Whatsapp) return TimelineCategory.Whatsapp;
  if (record.sourceChannel === SourceChannel.AiChat) return TimelineCategory.AiChat;
  if (record.sourceChannel === SourceChannel.Cli) return TimelineCategory.Manual;
  if (record.sourceChannel === SourceChannel.Ide) return TimelineCategory.Manual;
  return TimelineCategory.Manual;
}

function hasTimelineReminder(record: Pick<NoteRecord, 'reminderAt'>) {
  return Boolean(record.reminderAt);
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
  const noReminder = "(n.reminder_at IS NULL)";
  if (category === TimelineCategory.All) return;
  if (category === TimelineCategory.Reminder) {
    clauses.push("(n.reminder_at IS NOT NULL)");
    return;
  }
  clauses.push(noReminder);
  if (category === TimelineCategory.Github) {
    clauses.push(`n.source_channel = '${SourceChannel.Github}'`);
    return;
  }
  if (category === TimelineCategory.Whatsapp) {
    clauses.push(`n.source_channel = '${SourceChannel.Whatsapp}'`);
    return;
  }
  if (category === TimelineCategory.AiChat) {
    clauses.push(`n.source_channel = '${SourceChannel.AiChat}'`);
    return;
  }
  clauses.push(`n.source_channel <> '${SourceChannel.Github}'`);
  clauses.push(`n.source_channel <> '${SourceChannel.Whatsapp}'`);
  clauses.push(`n.source_channel <> '${SourceChannel.AiChat}'`);
}

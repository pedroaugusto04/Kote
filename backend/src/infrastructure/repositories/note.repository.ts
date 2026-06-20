import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { eq, and, count, desc, sql, inArray, notInArray, or } from 'drizzle-orm';

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
import { noteSummary } from '../mappers/content-query.mappers.js';
import { noteFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { notes, attachments, NoteStatus, projects, workspaces, categories, noteCategories } from '../persistence/schema/index.js';

@Injectable()
export class PostgresNoteRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) { }

  private async hydrateMarkdown(note: NoteRecord): Promise<NoteRecord> {
    return this.contentObjectStorage.hydrateMarkdown(note);
  }

  private async resolveIds(userId: string, projectSlug: string | null, workspaceSlug: string): Promise<{ projectId: string | null; workspaceId: string }> {
    const db = this.database.getDb();

    const wsResult = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), eq(workspaces.workspaceSlug, workspaceSlug)))
      .limit(1);

    if (wsResult.length === 0) {
      throw new Error(`Workspace not found for slug: ${workspaceSlug}`);
    }
    const workspaceId = wsResult[0].id;

    let projectId: string | null = null;
    if (projectSlug) {
      const projResult = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.userId, userId), eq(projects.projectSlug, projectSlug)))
        .limit(1);
      if (projResult.length > 0) {
        projectId = projResult[0].id;
      }
    }
    return { projectId, workspaceId };
  }

  async list(userId: string) {
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
        reminderDate: notes.reminderDate,
        reminderAt: notes.reminderAt,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        attachmentCount: count(attachments.id).as('attachment_count'),
        categories: sql<any[]>`COALESCE(
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
      .leftJoin(attachments, and(
        eq(attachments.userId, notes.userId),
        eq(attachments.noteId, notes.id)
      ))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(eq(notes.userId, userId))
      .groupBy(notes.id, projects.projectSlug)
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
        reminderDate: notes.reminderDate,
        reminderAt: notes.reminderAt,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        attachmentCount: count(attachments.id).as('attachment_count'),
        categories: sql<any[]>`COALESCE(
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
      .leftJoin(attachments, and(
        eq(attachments.userId, notes.userId),
        eq(attachments.noteId, notes.id)
      ))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(whereCondition)
      .groupBy(notes.id, projects.projectSlug)
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
      `select n.*, p.project_slug, count(distinct a.id)::int as attachment_count,
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
       group by n.id, p.project_slug
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
      `select n.*, p.project_slug, count(distinct a.id)::int as attachment_count,
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
       group by n.id, p.project_slug
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
        reminderDate: notes.reminderDate,
        reminderAt: notes.reminderAt,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        categories: sql<any[]>`COALESCE(
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
        reminderDate: notes.reminderDate,
        reminderAt: notes.reminderAt,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        categories: sql<any[]>`COALESCE(
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
      .where(and(eq(notes.userId, userId), inArray(notes.id, ids)))
      .groupBy(notes.id, projects.projectSlug);

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
        reminderDate: notes.reminderDate,
        reminderAt: notes.reminderAt,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        categories: sql<any[]>`COALESCE(
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
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, input);

    if (input.id) {
      const existing = await this.getById(userId, input.id);
      if (existing) {
        return this.update(userId, input);
      }
    }

    const db = this.database.getDb();
    const { projectId, workspaceId } = await this.resolveIds(userId, input.projectSlug ?? null, input.workspaceSlug ?? 'default');
    const noteId = crypto.randomUUID();

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
        markdownStorageKey,
        metadata: input.metadata,
        source: input.source,
        sessionId: input.sessionId ?? '',
        reminderDate: input.reminderDate ?? '',
        reminderAt: input.reminderAt ?? '',
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
      throw new Error(`Note not found after creation: ${noteId}`);
    }
    return created;
  }

  async update(userId: string, input: SaveNoteInput) {
    const existing = await this.getById(userId, String(input.id || ''));
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, input);
    await this.updateWithClient(this.database.getPool(), userId, input, markdownStorageKey);
    if (existing?.markdownStorageKey && existing.markdownStorageKey !== markdownStorageKey) {
      await this.contentObjectStorage.deleteObjects([existing.markdownStorageKey]);
    }
    const updated = await this.getById(userId, String(input.id || ''));
    if (!updated) {
      throw new Error(`Note not found after update: ${input.id}`);
    }
    return updated;
  }

  async updateReminderStatus(userId: string, id: string, status: string) {
    const db = this.database.getDb();
    await db
      .update(notes)
      .set({ status: status as NoteStatus, updatedAt: new Date() })
      .where(and(eq(notes.userId, userId), eq(notes.id, id)));

    return this.getById(userId, id);
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

  async updateWithClient(client: Pick<PoolClient, 'query'>, userId: string, input: SaveNoteInput, markdownStorageKey: string) {
    let projectId = input.projectId;
    let workspaceId = input.workspaceId;
    if ((!projectId && input.projectSlug) || (!workspaceId && input.workspaceSlug)) {
      const wsResult = await client.query('select id from kb_workspaces where user_id = $1 and workspace_slug = $2 limit 1', [userId, input.workspaceSlug]);
      if (wsResult.rows.length === 0) {
        throw new Error(`Workspace not found for slug: ${input.workspaceSlug}`);
      }
      workspaceId = wsResult.rows[0].id;

      if (input.projectSlug) {
        const projResult = await client.query('select id from kb_projects where user_id = $1 and project_slug = $2 limit 1', [userId, input.projectSlug]);
        if (projResult.rows.length > 0) {
          projectId = projResult.rows[0].id;
        }
      }
    }

    const updateResult = await client.query(
      `update kb_notes
       set path = $3,
           title = $4,
           project_id = $5,
           workspace_id = $6,
           folder_id = $7,
           status = $8::note_status_enum,
           tags = $9::jsonb,
           occurred_at = $10,
           source_channel = $11,
           summary = $12,
           markdown_storage_key = $13,
           metadata = $14::jsonb,
           source = $15,
           session_id = $16,
           reminder_date = $17,
           reminder_at = $18,
           updated_at = now()
       where user_id = $1 and id = $2
       returning *`,
      [
        userId,
        input.id,
        input.path,
        input.title,
        projectId || null,
        workspaceId,
        input.folderId,
        input.status,
        JSON.stringify(input.tags),
        input.occurredAt,
        input.sourceChannel,
        input.summary,
        markdownStorageKey,
        JSON.stringify(input.metadata),
        input.source,
        input.sessionId ?? '',
        input.reminderDate ?? '',
        input.reminderAt ?? '',
      ]
    );

    if (input.categoryIds) {
      await client.query('delete from kb_note_categories where note_id = $1', [input.id]);
      for (const catId of input.categoryIds) {
        await client.query(
          'insert into kb_note_categories (note_id, category_id) values ($1, $2) on conflict do nothing',
          [input.id, catId]
        );
      }
    }

    return updateResult;
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

  async getNoteNeighbors(userId: string, noteId: string, projectId?: string, workspaceId?: string) {
    const conditions: string[] = ['n.user_id = $1'];
    const values: unknown[] = [userId];

    if (projectId) {
      values.push(projectId);
      conditions.push(`n.project_id = $${values.length}`);
    }
    if (workspaceId) {
      values.push(workspaceId);
      conditions.push(`n.workspace_id = $${values.length}`);
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

function projectTimelineCategory(record: Pick<NoteRecord, 'metadata' | 'source' | 'sourceChannel' | 'reminderDate' | 'reminderAt'>): ProjectTimelineFilterCategory {
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
  const noReminder = "(n.reminder_date = '' and n.reminder_at = '')";
  if (category === 'all') return;
  if (category === 'reminder') {
    clauses.push("(n.reminder_date <> '' or n.reminder_at <> '')");
    return;
  }
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
}

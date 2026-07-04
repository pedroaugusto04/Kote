import { Injectable } from '@nestjs/common';
import { eq, and, count, desc, sql, inArray, notInArray } from 'drizzle-orm';

import { StatusFilter, terminalStatuses } from '../../contracts/status-filters.js';
import { tokenizeQuery, getSpecialQueryIntent } from '../../application/utils/query.utils.js';
import { readEnvironment } from '../../adapters/environment.js';
import { ReminderDeliveryChannel } from '../../contracts/enums.js';
import type { DueReminderView, ReminderView } from '../../application/models/reminder.models.js';
import type { NoteRecord } from '../../application/models/repository-records.models.js';
import type { ReviewView } from '../../application/models/review.models.js';
import { ContentQueryRepository } from '../../application/ports/notes/content.repository.js';
import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { resolveReminderScheduledAt } from '../../application/use-cases/reminders/reminder-schedule.js';
import { reminderDispatchEligibleStatuses } from '../../domain/note-status.js';
import { noteDetail, noteSummary, reminderFromNote, reviewFromNote } from '../mappers/content-query.mappers.js';
import { noteFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { notes, attachments, workspaces, projects, categories, noteCategories } from '../persistence/schema/index.js';
import { PostgresNoteRepository } from './note.repository.js';
import { PostgresAttachmentRepository } from './attachment.repository.js';

@Injectable()
export class PostgresContentQueryRepository extends ContentQueryRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly contentObjectStorage: ContentObjectStorageService,
    private readonly noteRepository: PostgresNoteRepository,
    private readonly attachmentRepository: PostgresAttachmentRepository,
  ) {
    super();
  }

  private async hydrateMarkdown(note: NoteRecord): Promise<NoteRecord> {
    return this.contentObjectStorage.hydrateMarkdown(note);
  }

  private async loadNotes(
    userId: string,
    filters?: {
      projectId?: string;
      workspaceId?: string;
      status?: string;
      query?: string;
      ids?: string[];
    }
  ) {
    const db = this.database.getDb();
    const conditions = [eq(notes.userId, userId)];

    if (filters?.workspaceId) {
      conditions.push(eq(notes.workspaceId, filters.workspaceId));
    }
    if (filters?.projectId) {
      conditions.push(eq(notes.projectId, filters.projectId));
    }
    if (filters?.status) {
      if (filters.status === StatusFilter.Open) {
        conditions.push(notInArray(notes.status, [...terminalStatuses]));
      } else {
        conditions.push(eq(notes.status, filters.status as any));
      }
    }

    let tsRankField: any = sql<number>`0`.as('ts_rank');
    let searchCondition: any = null;
    if (filters?.ids && filters.ids.length > 0) {
      searchCondition = inArray(notes.id, filters.ids);
    }

    if (filters?.query) {
      const intent = getSpecialQueryIntent(filters.query);
      if (!intent) {
        const tokens = tokenizeQuery(filters.query);
        if (tokens.length > 0) {
          const tsQueryStr = tokens.map((token) => `${token}:*`).join(' | ');
          const textCondition = sql`(${notes}.search_vector @@ to_tsquery('english', ${tsQueryStr}))`;
          tsRankField = sql<number>`ts_rank(${notes}.search_vector, to_tsquery('english', ${tsQueryStr}))`.as('ts_rank');

          if (searchCondition) {
            searchCondition = sql`(${searchCondition} OR ${textCondition})`;
          } else {
            searchCondition = textCondition;
          }
        }
      }
    }

    if (searchCondition) {
      conditions.push(searchCondition);
    }

    const result = await db
      .select({
        id: notes.id,
        userId: notes.userId,
        path: notes.path,
        title: notes.title,
        projectId: notes.projectId,
        workspaceId: notes.workspaceId,
        projectSlug: projects.projectSlug,
        workspaceSlug: workspaces.workspaceSlug,
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
        tsRank: tsRankField,
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
      .innerJoin(workspaces, eq(workspaces.id, notes.workspaceId))
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(attachments, and(
        eq(attachments.userId, notes.userId),
        eq(attachments.noteId, notes.id)
      ))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(and(...conditions))
      .groupBy(notes.id, workspaces.workspaceSlug, projects.projectSlug)
      .orderBy(desc(notes.occurredAt), notes.title);
    
    return result.map(noteFromRow);
  }

  async list(
    userId: string,
    filters?: {
      projectId?: string;
      workspaceId?: string;
      status?: string;
      query?: string;
      ids?: string[];
    }
  ) {
    return (await this.loadNotes(userId, filters)).map(noteSummary);
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
        workspaceSlug: workspaces.workspaceSlug,
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
      .innerJoin(workspaces, eq(workspaces.id, notes.workspaceId))
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(attachments, and(
        eq(attachments.userId, notes.userId),
        eq(attachments.noteId, notes.id)
      ))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .groupBy(notes.id, workspaces.workspaceSlug, projects.projectSlug)
      .limit(1);
    
    const note = result[0] ? await this.hydrateMarkdown(noteFromRow(result[0])) : null;
    if (!note) return null;

    const [noteAttachments, neighbors] = await Promise.all([
      this.attachmentRepository.list(userId, id),
      this.noteRepository.getNoteNeighbors(userId, id, {
        projectId: note.projectId,
        workspaceId: note.workspaceId,
      }),
    ]);
    return noteDetail(note, noteAttachments, neighbors);
  }

  async getNoteNeighbors(userId: string, noteId: string, input?: { projectId?: string; workspaceId?: string; folderId?: string; status?: string }) {
    return this.noteRepository.getNoteNeighbors(userId, noteId, input);
  }

  async listReviews(userId: string) {
    return (await this.loadNotes(userId)).map(reviewFromNote).filter((review): review is ReviewView => Boolean(review));
  }

  async getReviewById(userId: string, id: string) {
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
        workspaceSlug: workspaces.workspaceSlug,
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
      .innerJoin(workspaces, eq(workspaces.id, notes.workspaceId))
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .leftJoin(noteCategories, eq(noteCategories.noteId, notes.id))
      .leftJoin(categories, eq(categories.id, noteCategories.categoryId))
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .groupBy(notes.id, workspaces.workspaceSlug, projects.projectSlug)
      .limit(1);
    
    return result[0] ? reviewFromNote(noteFromRow(result[0])) : null;
  }

  async listReminders(userId: string) {
    return (await this.loadNotes(userId)).map(reminderFromNote).filter((reminder): reminder is ReminderView => Boolean(reminder));
  }

  async listDueRemindersByChannel(channel: ReminderDeliveryChannel, now: string) {
    const reminderTimeZone = readEnvironment().reminderTimeZone;
    const db = this.database.getDb();
    
    const recipientField = channel === ReminderDeliveryChannel.Telegram 
      ? workspaces.telegramChatId 
      : workspaces.whatsappChatJid;
    
    const result = await db
      .select({
        userId: notes.userId,
        workspaceSlug: workspaces.workspaceSlug,
        reminderId: notes.id,
        title: notes.title,
        projectSlug: projects.projectSlug,
        path: notes.path,
        status: notes.status,
        summary: notes.summary,
        metadata: notes.metadata,
        reminderAt: notes.reminderAt,
        recipientId: recipientField,
      })
      .from(notes)
      .innerJoin(workspaces, eq(workspaces.id, notes.workspaceId))
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .where(and(
        inArray(notes.status, reminderDispatchEligibleStatuses as any),
        sql`${notes.reminderAt} IS NOT NULL`,
        sql`coalesce(${recipientField}, '') <> ''`
      ));

    return result
      .map((row) => {
        const metadata = (row.metadata || {}) as Record<string, unknown>;
        const noteText = String(metadata.rawText || '').trim() || String(row.summary || '').trim() || String(row.title || '').trim();
        const scheduledAt = resolveReminderScheduledAt({
          reminderAt: row.reminderAt ? new Date(row.reminderAt).toISOString() : '',
        }, reminderTimeZone);
        if (!scheduledAt || scheduledAt > now) return null;
        return {
          userId: String(row.userId || ''),
          workspaceSlug: String(row.workspaceSlug || ''),
          channel,
          recipientId: String(row.recipientId || ''),
          reminderId: String(row.reminderId || ''),
          title: String(row.title || ''),
          noteText,
          project: String(row.projectSlug || ''),
          relativePath: String(row.path || ''),
          status: String(row.status || ''),
          scheduledAt,
        } satisfies DueReminderView;
      })
      .filter((reminder): reminder is DueReminderView => Boolean(reminder))
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt) || left.reminderId.localeCompare(right.reminderId));
  }
}

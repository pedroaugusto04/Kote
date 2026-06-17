import { Injectable } from '@nestjs/common';
import { eq, and, count, desc, sql, inArray } from 'drizzle-orm';

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
import { notes, attachments, workspaces } from '../persistence/schema/index.js';

@Injectable()
export class PostgresContentQueryRepository extends ContentQueryRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) {
    super();
  }

  private async hydrateMarkdown(note: NoteRecord): Promise<NoteRecord> {
    return this.contentObjectStorage.hydrateMarkdown(note);
  }

  private async loadNotes(userId: string) {
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
      .orderBy(desc(notes.occurredAt), notes.title);
    
    return result.map(noteFromRow);
  }

  async list(userId: string) {
    return (await this.loadNotes(userId)).map(noteSummary);
  }

  async getById(userId: string, id: string) {
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
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .groupBy(notes.id)
      .limit(1);
    
    const note = result[0] ? await this.hydrateMarkdown(noteFromRow(result[0])) : null;
    return note ? noteDetail(note) : null;
  }

  async listReviews(userId: string) {
    return (await this.loadNotes(userId)).map(reviewFromNote).filter((review): review is ReviewView => Boolean(review));
  }

  async getReviewById(userId: string, id: string) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
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
        workspaceSlug: notes.workspaceSlug,
        reminderId: notes.id,
        title: notes.title,
        projectSlug: notes.projectSlug,
        path: notes.path,
        status: notes.status,
        summary: notes.summary,
        metadata: notes.metadata,
        reminderDate: notes.reminderDate,
        reminderAt: notes.reminderAt,
        recipientId: recipientField,
      })
      .from(notes)
      .innerJoin(workspaces, and(
        eq(workspaces.userId, notes.userId),
        eq(workspaces.workspaceSlug, notes.workspaceSlug)
      ))
      .where(and(
        inArray(notes.status, reminderDispatchEligibleStatuses as any),
        sql`(n.reminder_date <> '' or n.reminder_at <> '')`,
        sql`coalesce(${recipientField}, '') <> ''`
      ));

    return result
      .map((row) => {
        const metadata = (row.metadata || {}) as Record<string, unknown>;
        const noteText = String(metadata.rawText || '').trim() || String(row.summary || '').trim() || String(row.title || '').trim();
        const scheduledAt = resolveReminderScheduledAt({
          reminderDate: String(row.reminderDate || ''),
          reminderTime: String(metadata.reminderTime || ''),
          reminderAt: String(row.reminderAt || ''),
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

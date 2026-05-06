import { Injectable } from '@nestjs/common';

import type { DueTelegramReminderView, ReminderView } from '../../application/models/reminder.models.js';
import type { NoteRecord } from '../../application/models/repository-records.models.js';
import type { ReviewView } from '../../application/models/review.models.js';
import { ContentQueryRepository } from '../../application/ports/content.repository.js';
import { KnowledgeStatus } from '../../contracts/enums.js';
import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { resolveReminderScheduledAt } from '../../application/use-cases/reminders/reminder-schedule.js';
import { noteDetail, noteSummary, reminderFromNote, reviewFromNote } from '../mappers/content-query.mappers.js';
import { noteFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';

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
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 order by occurred_at desc, title asc', [userId]);
    return result.rows.map(noteFromRow);
  }

  async list(userId: string) {
    return (await this.loadNotes(userId)).map(noteSummary);
  }

  async getById(userId: string, id: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 and id = $2 limit 1', [userId, id]);
    const note = result.rows[0] ? await this.hydrateMarkdown(noteFromRow(result.rows[0])) : null;
    return note ? noteDetail(note) : null;
  }

  async listReviews(userId: string) {
    return (await this.loadNotes(userId)).map(reviewFromNote).filter((review): review is ReviewView => Boolean(review));
  }

  async getReviewById(userId: string, id: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 and id = $2 limit 1', [userId, id]);
    return result.rows[0] ? reviewFromNote(noteFromRow(result.rows[0])) : null;
  }

  async listReminders(userId: string) {
    return (await this.loadNotes(userId)).map(reminderFromNote).filter((reminder): reminder is ReminderView => Boolean(reminder));
  }

  async listDueTelegramReminders(now: string) {
    const result = await this.database.getPool().query(
      `select n.user_id, n.workspace_slug, n.id as reminder_id, n.title, n.project_slug, n.path, n.status, n.metadata, w.telegram_chat_id
       from kb_notes n
       join kb_workspaces w on w.user_id = n.user_id and w.workspace_slug = n.workspace_slug
       where n.status = any($1::text[])
         and coalesce(n.metadata->>'reminderDate', '') <> ''
         and coalesce(w.telegram_chat_id, '') <> ''`,
      [[KnowledgeStatus.Open, KnowledgeStatus.Active]],
    );

    return result.rows
      .map((row) => {
        const metadata = (row.metadata || {}) as Record<string, unknown>;
        const scheduledAt = resolveReminderScheduledAt({
          reminderDate: metadata.reminderDate,
          reminderTime: metadata.reminderTime,
          reminderAt: metadata.reminderAt,
        });
        if (!scheduledAt || scheduledAt > now) return null;
        return {
          userId: String(row.user_id || ''),
          workspaceSlug: String(row.workspace_slug || ''),
          telegramChatId: String(row.telegram_chat_id || ''),
          reminderId: String(row.reminder_id || ''),
          title: String(row.title || ''),
          project: String(row.project_slug || ''),
          relativePath: String(row.path || ''),
          status: String(row.status || ''),
          scheduledAt,
        } satisfies DueTelegramReminderView;
      })
      .filter((reminder): reminder is DueTelegramReminderView => Boolean(reminder))
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt) || left.reminderId.localeCompare(right.reminderId));
  }
}

import { Injectable } from '@nestjs/common';

import { readEnvironment } from '../../adapters/environment.js';
import { ReminderDeliveryChannel } from '../../contracts/enums.js';
import type { DueReminderView, ReminderView } from '../../application/models/reminder.models.js';
import type { NoteRecord } from '../../application/models/repository-records.models.js';
import type { ReviewView } from '../../application/models/review.models.js';
import { ContentQueryRepository } from '../../application/ports/content.repository.js';
import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { resolveReminderScheduledAt } from '../../application/use-cases/reminders/reminder-schedule.js';
import { reminderDispatchEligibleStatuses } from '../../domain/note-status.js';
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
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where n.user_id = $1
       group by n.id
       order by n.occurred_at desc, n.title asc`,
      [userId],
    );
    return result.rows.map(noteFromRow);
  }

  async list(userId: string) {
    return (await this.loadNotes(userId)).map(noteSummary);
  }

  async getById(userId: string, id: string) {
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where n.user_id = $1 and n.id = $2
       group by n.id
       limit 1`,
      [userId, id],
    );
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

  async listDueRemindersByChannel(channel: ReminderDeliveryChannel, now: string) {
    const reminderTimeZone = readEnvironment().reminderTimeZone;
    const recipientField = channel === ReminderDeliveryChannel.Telegram ? 'w.telegram_chat_id' : 'w.whatsapp_chat_jid';
    const result = await this.database.getPool().query(
      `select n.user_id, n.workspace_slug, n.id as reminder_id, n.title, n.project_slug, n.path, n.status, n.summary, n.metadata, ${recipientField} as recipient_id
       from kb_notes n
       join kb_workspaces w on w.user_id = n.user_id and w.workspace_slug = n.workspace_slug
       where n.status = any($1::text[])
         and (coalesce(n.metadata->>'reminderAt', '') <> '' or coalesce(n.metadata->>'reminderDate', '') <> '')
         and coalesce(${recipientField}, '') <> ''`,
      [reminderDispatchEligibleStatuses],
    );

    return result.rows
      .map((row) => {
        const metadata = (row.metadata || {}) as Record<string, unknown>;
        const noteText = String(metadata.rawText || '').trim() || String(row.summary || '').trim() || String(row.title || '').trim();
        const scheduledAt = resolveReminderScheduledAt({
          reminderDate: metadata.reminderDate,
          reminderTime: metadata.reminderTime,
          reminderAt: metadata.reminderAt,
        }, reminderTimeZone);
        if (!scheduledAt || scheduledAt > now) return null;
        return {
          userId: String(row.user_id || ''),
          workspaceSlug: String(row.workspace_slug || ''),
          channel,
          recipientId: String(row.recipient_id || ''),
          reminderId: String(row.reminder_id || ''),
          title: String(row.title || ''),
          noteText,
          project: String(row.project_slug || ''),
          relativePath: String(row.path || ''),
          status: String(row.status || ''),
          scheduledAt,
        } satisfies DueReminderView;
      })
      .filter((reminder): reminder is DueReminderView => Boolean(reminder))
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt) || left.reminderId.localeCompare(right.reminderId));
  }
}

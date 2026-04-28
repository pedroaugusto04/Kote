import { Injectable } from '@nestjs/common';

import type { ReminderView } from '../../application/models/reminder.models.js';
import type { ReviewView } from '../../application/models/review.models.js';
import { ContentQueryRepository } from '../../application/ports/content.repository.js';
import { noteDetail, noteSummary, reminderFromNote, reviewFromNote } from './content-query.mappers.js';
import { noteFromRow } from './row.mappers.js';
import { PostgresDatabase } from './database.js';

@Injectable()
export class PostgresContentQueryRepository extends ContentQueryRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
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
    const note = result.rows[0] ? noteFromRow(result.rows[0]) : null;
    return note ? noteDetail(note) : null;
  }

  async listReviews(userId: string) {
    return (await this.loadNotes(userId)).map(reviewFromNote).filter((review): review is ReviewView => Boolean(review));
  }

  async listReminders(userId: string) {
    return (await this.loadNotes(userId)).map(reminderFromNote).filter((reminder): reminder is ReminderView => Boolean(reminder));
  }
}

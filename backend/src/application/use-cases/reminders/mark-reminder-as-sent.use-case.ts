import { Injectable } from '@nestjs/common';

import { KnowledgeStatus, ReminderDispatchMode } from '../../../contracts/enums.js';
import { slugify } from '../../../domain/strings.js';
import { currentDateTimeInTimeZone } from '../../../domain/time.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ReminderDispatchRepository } from '../../ports/reminders/workflow-state.repository.js';

@Injectable()
export class MarkReminderAsSentUseCase {
  constructor(
    private readonly reminderDispatchRepository: ReminderDispatchRepository,
    private readonly contentRepository: ContentRepository,
  ) {}

  async execute(ids: string[], userId: string, workspaceSlug = 'default', mode: ReminderDispatchMode = ReminderDispatchMode.Exact, dispatchKey = currentDateTimeInTimeZone('UTC').date) {
    const workspace = slugify(workspaceSlug) || 'default';
    const uniqueIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
    
    // Batch fetch all notes
    const notes = await this.contentRepository.getNotesByIds(userId, uniqueIds);
    const notesMap = new Map(notes.map((n) => [n.id, n]));

    // Mark all reminders as sent (batch operation)
    await Promise.all(uniqueIds.map(async (id) => {
      await this.reminderDispatchRepository.markSent(userId, workspace, mode, dispatchKey, id);
    }));

    // Batch update status for eligible notes
    const eligibleIds = uniqueIds.filter((id) => {
      const note = notesMap.get(id);
      if (!note || !note.reminderAt) return false;
      return note.status === KnowledgeStatus.Pending || note.status === KnowledgeStatus.Overdue || note.status === KnowledgeStatus.Sent;
    });

    if (eligibleIds.length > 0) {
      await this.contentRepository.updateReminderStatuses(userId, eligibleIds, KnowledgeStatus.Sent);
    }
    
    return { ok: true, marked: uniqueIds.length };
  }
}

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
    await Promise.all(uniqueIds.map(async (id) => {
      await this.reminderDispatchRepository.markSent(userId, workspace, mode, dispatchKey, id);
      const note = await this.contentRepository.getNoteById(userId, id);
      if (!note || (!String(note.metadata.reminderDate || '').trim() && !String(note.metadata.reminderAt || '').trim())) return;
      if (note.status !== KnowledgeStatus.Pending && note.status !== KnowledgeStatus.Overdue && note.status !== KnowledgeStatus.Sent) return;
      await this.contentRepository.updateNote(userId, {
        ...note,
        status: KnowledgeStatus.Sent,
        frontmatter: {
          ...note.frontmatter,
          status: KnowledgeStatus.Sent,
        },
      });
    }));
    return { ok: true, marked: uniqueIds.length };
  }
}

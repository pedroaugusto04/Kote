import { Injectable } from '@nestjs/common';

import { ReminderDispatchMode } from '../../../contracts/enums.js';
import { slugify } from '../../../domain/strings.js';
import { currentSaoPauloDateTime } from '../../../domain/time.js';
import { ReminderDispatchRepository } from '../../ports/repositories.js';

@Injectable()
export class MarkReminderAsSentUseCase {
  constructor(private readonly reminderDispatchRepository: ReminderDispatchRepository) {}

  async execute(ids: string[], userId: string, workspaceSlug = 'default', mode: ReminderDispatchMode = ReminderDispatchMode.Exact, dispatchKey = currentSaoPauloDateTime().date) {
    const workspace = slugify(workspaceSlug) || 'default';
    const uniqueIds = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
    await Promise.all(uniqueIds.map((id) => this.reminderDispatchRepository.markSent(userId, workspace, mode, dispatchKey, id)));
    return { ok: true, marked: uniqueIds.length };
  }
}

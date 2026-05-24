import { Injectable } from '@nestjs/common';

import { KnowledgeStatus } from '../../../contracts/enums.js';
import type { ReminderBoardInput } from '../../models/reminder-board.models.js';
import { reminderBoardColumnKeys } from '../../models/reminder-board.models.js';
import type { ReminderBoardCard, ReminderBoardColumnKey, ReminderBoardResponse } from '../../models/reminder.models.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { sortRemindersBySchedule } from './reminder-list.helpers.js';
import { RefreshReminderStatusesUseCase } from './refresh-reminder-statuses.use-case.js';

@Injectable()
export class ListReminderBoardUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly refreshReminderStatuses: RefreshReminderStatusesUseCase,
  ) {}

  async execute(userId: string, input: ReminderBoardInput): Promise<ReminderBoardResponse> {
    const columns = emptyColumns();
    const reminders = await this.refreshReminderStatuses.execute(userId, (await this.contentQueryRepository.listReminders(userId))
      .filter((reminder) => !input.workspaceSlug || reminder.workspace === input.workspaceSlug)
      .filter((reminder) => !input.projectSlug || reminder.project === input.projectSlug), { workspaceSlug: input.workspaceSlug });

    for (const reminder of sortRemindersBySchedule(reminders)) {
      const columnKey = boardColumnKey(reminder);
      columns[columnKey].total += 1;
      if (columns[columnKey].items.length < input.limitPerColumn) {
        columns[columnKey].items.push(reminder);
      }
    }

    return { columns };
  }
}

function emptyColumns(): ReminderBoardResponse['columns'] {
  return reminderBoardColumnKeys.reduce((acc, key) => {
    acc[key] = { items: [], total: 0 };
    return acc;
  }, {} as ReminderBoardResponse['columns']);
}

function boardColumnKey(reminder: Pick<ReminderBoardCard, 'status' | 'isOverdue'>): ReminderBoardColumnKey {
  if (reminder.status === KnowledgeStatus.Resolved) return 'resolved';
  if (reminder.status === KnowledgeStatus.Archived) return 'archived';
  return reminder.status === KnowledgeStatus.Overdue || reminder.isOverdue ? 'overdue' : 'upcoming';
}

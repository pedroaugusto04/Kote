import { Injectable } from '@nestjs/common';

import { KnowledgeStatus, ReminderBoardColumnKey } from '../../../contracts/enums.js';
import type { ReminderBoardInput } from '../../models/reminder-board.models.js';
import { reminderBoardColumnKeys } from '../../models/reminder-board.models.js';
import type { ReminderBoardCard, ReminderBoardResponse } from '../../models/reminder.models.js';
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
    const columns = emptyColumns(input.limitPerColumn);
    const reminders = await this.refreshReminderStatuses.execute(userId, (await this.contentQueryRepository.listReminders(userId))
      .filter((reminder) => !input.workspaceSlug || reminder.workspace === input.workspaceSlug)
      .filter((reminder) => !input.projectSlug || reminder.project === input.projectSlug), { workspaceSlug: input.workspaceSlug });

    const columnItems: Record<ReminderBoardColumnKey, ReminderBoardCard[]> = {
      [ReminderBoardColumnKey.Overdue]: [],
      [ReminderBoardColumnKey.Upcoming]: [],
      [ReminderBoardColumnKey.Resolved]: [],
      [ReminderBoardColumnKey.Archived]: [],
    };

    for (const reminder of sortRemindersBySchedule(reminders)) {
      const columnKey = boardColumnKey(reminder);
      columnItems[columnKey].push(reminder);
    }

    for (const columnKey of reminderBoardColumnKeys) {
      const items = columnItems[columnKey];
      const total = items.length;
      const page = input.columnPage[columnKey] || 1;
      const pageSize = input.limitPerColumn;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const startIndex = 0;
      const endIndex = page * pageSize;
      const paginatedItems = items.slice(startIndex, endIndex);

      columns[columnKey] = {
        items: paginatedItems,
        total,
        page,
        pageSize,
        totalPages,
        hasNext: page < totalPages,
      };
    }

    return { columns };
  }
}

function emptyColumns(limitPerColumn: number): ReminderBoardResponse['columns'] {
  return reminderBoardColumnKeys.reduce((acc, key) => {
    acc[key] = { items: [], total: 0, page: 1, pageSize: limitPerColumn, totalPages: 1, hasNext: false };
    return acc;
  }, {} as ReminderBoardResponse['columns']);
}

function boardColumnKey(reminder: Pick<ReminderBoardCard, 'status' | 'isOverdue'>): ReminderBoardColumnKey {
  if (reminder.status === KnowledgeStatus.Resolved) return ReminderBoardColumnKey.Resolved;
  if (reminder.status === KnowledgeStatus.Archived) return ReminderBoardColumnKey.Archived;
  return reminder.status === KnowledgeStatus.Overdue || reminder.isOverdue ? ReminderBoardColumnKey.Overdue : ReminderBoardColumnKey.Upcoming;
}

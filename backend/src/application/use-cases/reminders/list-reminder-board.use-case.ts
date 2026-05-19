import { Injectable } from '@nestjs/common';

import { KnowledgeStatus, ReminderDispatchMode } from '../../../contracts/enums.js';
import type { ReminderBoardInput } from '../../models/reminder-board.models.js';
import { reminderBoardColumnKeys } from '../../models/reminder-board.models.js';
import type { ReminderBoardCard, ReminderBoardColumnKey, ReminderBoardResponse } from '../../models/reminder.models.js';
import { ContentQueryRepository } from '../../ports/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/runtime-environment.port.js';
import { ReminderDispatchRepository } from '../../ports/workflow-state.repository.js';
import { sortRemindersBySchedule } from './reminder-list.helpers.js';
import { reminderDispatchKey, resolveReminderScheduledAt } from './reminder-schedule.js';
import { enrichReminderStatus } from './reminder-status.js';

@Injectable()
export class ListReminderBoardUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly reminderDispatchRepository: ReminderDispatchRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(userId: string, input: ReminderBoardInput): Promise<ReminderBoardResponse> {
    const now = new Date();
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
    const columns = emptyColumns();
    const reminders = await Promise.all((await this.contentQueryRepository.listReminders(userId))
      .filter((reminder) => !input.workspaceSlug || reminder.workspace === input.workspaceSlug)
      .filter((reminder) => !input.projectSlug || reminder.project === input.projectSlug)
      .map(async (reminder): Promise<ReminderBoardCard> => {
        const normalized = enrichReminderStatus(reminder, now);
        if (normalized.status !== KnowledgeStatus.Pending) return normalized;

        const scheduledAt = resolveReminderScheduledAt(normalized, reminderTimeZone);
        if (!scheduledAt) return normalized;

        const sent = await this.reminderDispatchRepository.hasSent(
          userId,
          normalized.workspace || input.workspaceSlug || 'default',
          ReminderDispatchMode.Exact,
          reminderDispatchKey(scheduledAt),
          normalized.id,
        );
        return sent ? { ...normalized, status: KnowledgeStatus.Sent, isOverdue: false } : normalized;
      }));

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
  return reminder.isOverdue ? 'overdue' : 'upcoming';
}

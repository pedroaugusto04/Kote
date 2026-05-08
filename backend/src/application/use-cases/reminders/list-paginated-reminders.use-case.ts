import { Injectable } from '@nestjs/common';

import { buildPaginationMeta } from '../../../contracts/pagination.js';
import { ReminderDispatchMode } from '../../../contracts/enums.js';
import type { ListRemindersInput } from '../../models/reminder-list.models.js';
import { ContentQueryRepository } from '../../ports/content.repository.js';
import { ReminderDispatchRepository } from '../../ports/workflow-state.repository.js';
import { reminderDispatchKey, resolveReminderScheduledAt } from './reminder-schedule.js';
import { resolveReminderListStatus } from './reminder-status.js';

@Injectable()
export class ListPaginatedRemindersUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly reminderDispatchRepository: ReminderDispatchRepository,
  ) {}

  async execute(userId: string, input: ListRemindersInput) {
    const reminders = (await Promise.all(
      (await this.contentQueryRepository.listReminders(userId)).map(async (reminder) => {
        const scheduledAt = resolveReminderScheduledAt(reminder);
        const dispatchKey = reminderDispatchKey(scheduledAt);
        const sent = dispatchKey
          ? await this.reminderDispatchRepository.hasSent(
            userId,
            reminder.workspace,
            ReminderDispatchMode.Exact,
            dispatchKey,
            reminder.id,
          )
          : false;

        return {
          ...reminder,
          status: resolveReminderListStatus({ ...reminder, sent }),
        };
      }),
    ))
      .filter((reminder) => !input.workspaceSlug || reminder.workspace === input.workspaceSlug)
      .filter((reminder) => !input.status || reminder.status === input.status);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, reminders.length);
    const start = (pagination.page - 1) * pagination.pageSize;
    return { items: reminders.slice(start, start + pagination.pageSize), pagination };
  }
}

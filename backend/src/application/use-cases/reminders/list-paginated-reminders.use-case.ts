import { Injectable } from '@nestjs/common';

import { KnowledgeStatus } from '../../../contracts/enums.js';
import { buildPaginationMeta } from '../../../contracts/pagination.js';
import { StatusFilter } from '../../../contracts/status-filters.js';
import type { ListRemindersInput } from '../../models/reminder-list.models.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { sortRemindersForList } from './reminder-list.helpers.js';
import { RefreshReminderStatusesUseCase } from './refresh-reminder-statuses.use-case.js';

@Injectable()
export class ListPaginatedRemindersUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly refreshReminderStatuses: RefreshReminderStatusesUseCase,
  ) {}

  async execute(userId: string, input: ListRemindersInput) {
    const remindersWithStatus = await this.refreshReminderStatuses.execute(
      userId,
      await this.contentQueryRepository.listReminders(userId),
      { workspaceSlug: input.workspaceSlug },
    );
    const statusFilter = input.status || StatusFilter.Open;
    const reminders = sortRemindersForList(remindersWithStatus
      .filter((reminder) => !input.workspaceSlug || reminder.workspace === input.workspaceSlug)
      .filter((reminder) => {
        if (statusFilter === StatusFilter.All) return true;
        if (statusFilter === StatusFilter.Open) {
          return reminder.status !== KnowledgeStatus.Resolved && reminder.status !== KnowledgeStatus.Archived;
        }
        return reminder.status === statusFilter;
      }), statusFilter);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, reminders.length);
    const start = (pagination.page - 1) * pagination.pageSize;
    return { items: reminders.slice(start, start + pagination.pageSize), pagination };
  }
}

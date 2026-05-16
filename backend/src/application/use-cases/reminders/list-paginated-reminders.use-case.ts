import { Injectable } from '@nestjs/common';

import { RuntimeEnvironmentProvider } from '../../ports/runtime-environment.port.js';
import { buildPaginationMeta } from '../../../contracts/pagination.js';
import type { ListRemindersInput } from '../../models/reminder-list.models.js';
import { ContentQueryRepository } from '../../ports/content.repository.js';
import { enrichReminderStatus } from './reminder-status.js';

function reminderTimestamp(reminder: { reminderAt?: string; reminderDate?: string; reminderTime?: string }) {
  const direct = Date.parse(reminder.reminderAt || '');
  if (!Number.isNaN(direct)) return direct;
  const fallback = Date.parse(`${reminder.reminderDate || ''}T${reminder.reminderTime || '00:00'}:00.000Z`);
  if (!Number.isNaN(fallback)) return fallback;
  return Number.MAX_SAFE_INTEGER;
}

function sortRemindersForList<T extends { id: string; title: string; status: string; reminderAt?: string; reminderDate?: string; reminderTime?: string }>(
  reminders: T[],
  statusFilter?: string,
) {
  if (statusFilter) return reminders;
  return [...reminders].sort((left, right) => {
    const leftPendingRank = left.status === 'pending' ? 0 : 1;
    const rightPendingRank = right.status === 'pending' ? 0 : 1;
    return leftPendingRank - rightPendingRank
      || reminderTimestamp(left) - reminderTimestamp(right)
      || left.title.localeCompare(right.title)
      || left.id.localeCompare(right.id);
  });
}

@Injectable()
export class ListPaginatedRemindersUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(userId: string, input: ListRemindersInput) {
    const now = new Date();
    const reminders = sortRemindersForList((await this.contentQueryRepository.listReminders(userId))
      .map((reminder) => enrichReminderStatus(reminder, now))
      .filter((reminder) => !input.workspaceSlug || reminder.workspace === input.workspaceSlug)
      .filter((reminder) => !input.status || reminder.status === input.status), input.status);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, reminders.length);
    const start = (pagination.page - 1) * pagination.pageSize;
    return { items: reminders.slice(start, start + pagination.pageSize), pagination };
  }
}

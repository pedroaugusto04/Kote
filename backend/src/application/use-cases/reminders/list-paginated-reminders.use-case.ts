import { Injectable } from '@nestjs/common';

import { RuntimeEnvironmentProvider } from '../../ports/runtime-environment.port.js';
import { buildPaginationMeta } from '../../../contracts/pagination.js';
import { KnowledgeStatus, ReminderDispatchMode } from '../../../contracts/enums.js';
import type { ListRemindersInput } from '../../models/reminder-list.models.js';
import { ContentQueryRepository } from '../../ports/content.repository.js';
import { ReminderDispatchRepository } from '../../ports/workflow-state.repository.js';
import { sortRemindersForList } from './reminder-list.helpers.js';
import { enrichReminderStatus } from './reminder-status.js';
import { reminderDispatchKey, resolveReminderScheduledAt } from './reminder-schedule.js';

@Injectable()
export class ListPaginatedRemindersUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly reminderDispatchRepository: ReminderDispatchRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(userId: string, input: ListRemindersInput) {
    const now = new Date();
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
    const remindersWithStatus = await Promise.all((await this.contentQueryRepository.listReminders(userId))
      .map(async (reminder) => {
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
    const reminders = sortRemindersForList(remindersWithStatus
      .filter((reminder) => !input.workspaceSlug || reminder.workspace === input.workspaceSlug)
      .filter((reminder) => !input.status || reminder.status === input.status), input.status);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, reminders.length);
    const start = (pagination.page - 1) * pagination.pageSize;
    return { items: reminders.slice(start, start + pagination.pageSize), pagination };
  }
}

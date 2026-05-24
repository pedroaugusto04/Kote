import { Injectable } from '@nestjs/common';

import { KnowledgeStatus, ReminderDispatchMode } from '../../../contracts/enums.js';
import type { ReminderView } from '../../models/reminder.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { ReminderDispatchRepository } from '../../ports/reminders/workflow-state.repository.js';
import { reminderDispatchKey, resolveReminderScheduledAt } from './reminder-schedule.js';
import { enrichReminderStatus } from './reminder-status.js';

@Injectable()
export class RefreshReminderStatusesUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly reminderDispatchRepository: ReminderDispatchRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(userId: string, reminders: ReminderView[], input: { workspaceSlug?: string; now?: Date } = {}) {
    const now = input.now || new Date();
    const nowMs = now.getTime();
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;

    return Promise.all(reminders.map(async (reminder) => {
      const normalized = enrichReminderStatus(reminder, now);
      if (normalized.status === KnowledgeStatus.Resolved || normalized.status === KnowledgeStatus.Archived) {
        return normalized;
      }
      if (normalized.status === KnowledgeStatus.Sent) {
        return { ...normalized, isOverdue: false };
      }

      const scheduledAt = resolveReminderScheduledAt(normalized, reminderTimeZone);
      if (!scheduledAt) return normalized;

      const workspaceSlug = normalized.workspace || input.workspaceSlug || 'default';
      const sent = await this.reminderDispatchRepository.hasSent(
        userId,
        workspaceSlug,
        ReminderDispatchMode.Exact,
        reminderDispatchKey(scheduledAt),
        normalized.id,
      );
      const scheduledAtMs = Date.parse(scheduledAt);
      const nextStatus = sent
        ? KnowledgeStatus.Sent
        : !Number.isNaN(scheduledAtMs) && scheduledAtMs < nowMs
          ? KnowledgeStatus.Overdue
          : KnowledgeStatus.Pending;

      if (normalized.status !== nextStatus) {
        await this.contentRepository.updateReminderStatus(userId, normalized.id, nextStatus);
      }

      return {
        ...normalized,
        status: nextStatus,
        isOverdue: nextStatus === KnowledgeStatus.Overdue,
      };
    }));
  }
}

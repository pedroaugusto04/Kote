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

    const checkable: Array<{
      reminder: ReminderView;
      normalized: ReminderView;
      scheduledAt: string;
      workspaceSlug: string;
    }> = [];

    type PrecomputedEntry =
      | { terminal: true; normalized: ReminderView }
      | { terminal: false; normalized: ReminderView; scheduledAt: string; workspaceSlug: string };

    const precomputed: PrecomputedEntry[] = reminders.map((reminder) => {
      const normalized = enrichReminderStatus(reminder, now);
      if (normalized.status === KnowledgeStatus.Resolved || normalized.status === KnowledgeStatus.Archived) {
        return { terminal: true, normalized };
      }
      if (normalized.status === KnowledgeStatus.Sent) {
        return { terminal: true, normalized: { ...normalized, isOverdue: false } };
      }

      const scheduledAt = resolveReminderScheduledAt(normalized, reminderTimeZone);
      if (!scheduledAt) {
        return { terminal: true, normalized };
      }

      const workspaceSlug = normalized.workspace || input.workspaceSlug || 'default';
      const item = { reminder, normalized, scheduledAt, workspaceSlug };
      checkable.push(item);
      return { terminal: false, normalized, scheduledAt, workspaceSlug };
    });

    // Batch check if supported by repository
    const sentSetByWorkspace = new Map<string, Set<string>>();
    if (this.reminderDispatchRepository.getSentReminderIds && checkable.length > 0) {
      const byWorkspace = new Map<string, string[]>();
      for (const item of checkable) {
        const ids = byWorkspace.get(item.workspaceSlug) || [];
        ids.push(item.normalized.id);
        byWorkspace.set(item.workspaceSlug, ids);
      }

      for (const [wsSlug, ids] of byWorkspace.entries()) {
        const sentIds = await this.reminderDispatchRepository.getSentReminderIds(
          userId,
          wsSlug,
          ReminderDispatchMode.Exact,
          ids,
        );
        sentSetByWorkspace.set(wsSlug, sentIds);
      }
    }

    return Promise.all(precomputed.map(async (entry) => {
      if (entry.terminal) {
        return entry.normalized;
      }

      const { normalized, scheduledAt, workspaceSlug } = entry;
      const sentSet = sentSetByWorkspace.get(workspaceSlug);
      const sent = sentSet !== undefined
        ? sentSet.has(normalized.id)
        : await this.reminderDispatchRepository.hasSent(
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

import { Injectable } from '@nestjs/common';

import { ReminderDeliveryChannel, ReminderDispatchMode } from '../../../contracts/enums.js';
import { nowIso } from '../../../domain/time.js';
import { AppLogger } from '../../../observability/logger.js';
import type { DueReminderView } from '../../models/reminder.models.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { ReminderDeliveryGateway } from '../../ports/reminders/reminder-delivery.gateway.js';
import { ReminderDispatchRepository } from '../../ports/reminders/workflow-state.repository.js';
import { formatReminderScheduledAtLabel, reminderDispatchKey } from './reminder-schedule.js';
import { MarkReminderAsSentUseCase } from './mark-reminder-as-sent.use-case.js';
import { MAX_REMINDER_DELIVERY_ATTEMPTS, nextReminderRetryAt } from './reminder-retry-policy.js';
import { ReminderEventBus } from '../../services/reminder-event.bus.js';

@Injectable()
export class DispatchDueRemindersUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly reminderDispatchRepository: ReminderDispatchRepository,
    private readonly markReminderAsSent: MarkReminderAsSentUseCase,
    private readonly reminderDeliveryGateway: ReminderDeliveryGateway,
    private readonly logger: AppLogger,
    private readonly reminderEventBus?: ReminderEventBus,
  ) {}

  async execute(channel: ReminderDeliveryChannel, referenceNowIso = nowIso()) {
    const dueReminders = await this.contentQueryRepository.listDueRemindersByChannel(channel, referenceNowIso);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let delayed = 0;
    let exhausted = 0;

    for (const reminder of dueReminders) {
      const dispatchKey = reminderDispatchKey(reminder.scheduledAt);
      if (!dispatchKey) {
        skipped += 1;
        continue;
      }

      if (
        await this.reminderDispatchRepository.hasSent(
          reminder.userId,
          reminder.workspaceSlug,
          ReminderDispatchMode.Exact,
          dispatchKey,
          reminder.reminderId,
        )
      ) {
        skipped += 1;
        continue;
      }

      const retryKey = {
        userId: reminder.userId,
        workspaceSlug: reminder.workspaceSlug,
        mode: ReminderDispatchMode.Exact,
        dispatchKey,
        reminderId: reminder.reminderId,
        channel,
      };
      const retryState = await this.reminderDispatchRepository.getRetryState(retryKey);
      if (retryState && retryState.attemptCount >= MAX_REMINDER_DELIVERY_ATTEMPTS) {
        exhausted += 1;
        skipped += 1;
        continue;
      }
      if (retryState?.nextRetryAt && isFutureRetry(retryState.nextRetryAt, referenceNowIso)) {
        delayed += 1;
        skipped += 1;
        continue;
      }

      const result = await this.reminderDeliveryGateway.sendText({
        channel: reminder.channel,
        recipientId: reminder.recipientId,
        text: this.buildMessage(reminder),
        workspaceSlug: reminder.workspaceSlug,
        userId: reminder.userId,
        metadata: {
          reminderId: reminder.reminderId,
          scheduledAt: reminder.scheduledAt,
        },
      });

      if (!result.ok) {
        failed += 1;
        const failedAttemptCount = (retryState?.attemptCount || 0) + 1;
        const nextRetryAt = failedAttemptCount >= MAX_REMINDER_DELIVERY_ATTEMPTS
          ? ''
          : nextReminderRetryAt(referenceNowIso, failedAttemptCount);
        const failureState = await this.reminderDispatchRepository.recordFailure({
          ...retryKey,
          nextRetryAt,
          error: result.error || 'unknown_error',
        });
        this.logger.error('reminder.dispatch_failed', {
          channel: reminder.channel,
          userId: reminder.userId,
          workspaceSlug: reminder.workspaceSlug,
          reminderId: reminder.reminderId,
          scheduledAt: reminder.scheduledAt,
          attemptCount: failureState.attemptCount,
          maxAttempts: MAX_REMINDER_DELIVERY_ATTEMPTS,
          nextRetryAt: failureState.nextRetryAt,
          error: result.error || 'unknown_error',
        });
        continue;
      }

      await this.markReminderAsSent.execute(
        [reminder.reminderId],
        reminder.userId,
        reminder.workspaceSlug,
        ReminderDispatchMode.Exact,
        dispatchKey,
      );
      await this.reminderDispatchRepository.clearFailure(retryKey);
      sent += 1;

      this.reminderEventBus?.emit('reminder.sent', {
        userId: reminder.userId,
        workspaceSlug: reminder.workspaceSlug,
        channel: reminder.channel,
        noteTitle: reminder.title,
        project: reminder.project || '',
        text: reminder.noteText,
      });
    }

    return {
      ok: true,
      checked: dueReminders.length,
      sent,
      skipped,
      failed,
      delayed,
      exhausted,
    };
  }

  private buildMessage(reminder: DueReminderView) {
    return [
      'Reminder',
      `Project: ${reminder.project || '-'}`,
      `Note: ${reminder.title}`,
      '',
      'Note text:',
      reminder.noteText,
      '',
      `Scheduled for: ${formatReminderScheduledAtLabel(reminder.scheduledAt)}`,
    ].join('\n');
  }
}

function isFutureRetry(nextRetryAt: string, referenceNowIso: string): boolean {
  const retryAtMs = Date.parse(nextRetryAt);
  const nowMs = Date.parse(referenceNowIso);
  return !Number.isNaN(retryAtMs) && !Number.isNaN(nowMs) && retryAtMs > nowMs;
}

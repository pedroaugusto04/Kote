import { Injectable } from '@nestjs/common';

import { ReminderDeliveryChannel, ReminderDispatchMode } from '../../../contracts/enums.js';
import { nowIso } from '../../../domain/time.js';
import { AppLogger } from '../../../observability/logger.js';
import type { DueReminderView } from '../../models/reminder.models.js';
import { ContentQueryRepository } from '../../ports/content.repository.js';
import { ReminderDeliveryGateway } from '../../ports/reminder-delivery.gateway.js';
import { ReminderDispatchRepository } from '../../ports/workflow-state.repository.js';
import { formatReminderScheduledAtLabel, reminderDispatchKey } from './reminder-schedule.js';
import { MarkReminderAsSentUseCase } from './mark-reminder-as-sent.use-case.js';

@Injectable()
export class DispatchDueRemindersUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly reminderDispatchRepository: ReminderDispatchRepository,
    private readonly markReminderAsSent: MarkReminderAsSentUseCase,
    private readonly reminderDeliveryGateway: ReminderDeliveryGateway,
    private readonly logger: AppLogger,
  ) {}

  async execute(channel: ReminderDeliveryChannel, referenceNowIso = nowIso()) {
    const dueReminders = await this.contentQueryRepository.listDueRemindersByChannel(channel, referenceNowIso);
    let sent = 0;
    let skipped = 0;
    let failed = 0;

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
        this.logger.error('reminder.dispatch_failed', {
          channel: reminder.channel,
          userId: reminder.userId,
          workspaceSlug: reminder.workspaceSlug,
          reminderId: reminder.reminderId,
          scheduledAt: reminder.scheduledAt,
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
      sent += 1;
    }

    return {
      ok: true,
      checked: dueReminders.length,
      sent,
      skipped,
      failed,
    };
  }

  private buildMessage(reminder: DueReminderView) {
    return [
      'Lembrete',
      `Projeto: ${reminder.project || '-'}`,
      `Nota: ${reminder.title}`,
      '',
      'Texto da nota:',
      reminder.noteText,
      '',
      `Agendado para: ${formatReminderScheduledAtLabel(reminder.scheduledAt)}`,
    ].join('\n');
  }
}

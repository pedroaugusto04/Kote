import { Injectable } from '@nestjs/common';

import { ReminderDispatchMode } from '../../../contracts/enums.js';
import { nowIso } from '../../../domain/time.js';
import { AppLogger } from '../../../observability/logger.js';
import type { DueTelegramReminderView } from '../../models/reminder.models.js';
import { ContentQueryRepository } from '../../ports/content.repository.js';
import { TelegramMessageSender } from '../../ports/telegram-message.sender.js';
import { ReminderDispatchRepository } from '../../ports/workflow-state.repository.js';
import { formatReminderScheduledAtLabel, reminderDispatchKey } from './reminder-schedule.js';

@Injectable()
export class DispatchDueTelegramRemindersUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly reminderDispatchRepository: ReminderDispatchRepository,
    private readonly telegramMessageSender: TelegramMessageSender,
    private readonly logger: AppLogger,
  ) {}

  async execute(referenceNowIso = nowIso()) {
    const dueReminders = await this.contentQueryRepository.listDueTelegramReminders(referenceNowIso);
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

      const result = await this.telegramMessageSender.sendText({
        chatId: reminder.telegramChatId,
        text: this.buildMessage(reminder),
      });

      if (!result.ok) {
        failed += 1;
        this.logger.error('reminder.telegram_dispatch_failed', {
          userId: reminder.userId,
          workspaceSlug: reminder.workspaceSlug,
          reminderId: reminder.reminderId,
          scheduledAt: reminder.scheduledAt,
          error: result.error || 'unknown_error',
        });
        continue;
      }

      await this.reminderDispatchRepository.markSent(
        reminder.userId,
        reminder.workspaceSlug,
        ReminderDispatchMode.Exact,
        dispatchKey,
        reminder.reminderId,
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

  private buildMessage(reminder: DueTelegramReminderView) {
    return [
      'Lembrete',
      `Projeto: ${reminder.project || '-'}`,
      `Nota: ${reminder.title}`,
      `Agendado para: ${formatReminderScheduledAtLabel(reminder.scheduledAt)}`,
    ].join('\n');
  }
}

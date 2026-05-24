import { Injectable } from '@nestjs/common';

import { ReminderDeliveryChannel } from '../../contracts/enums.js';
import { AppLogger } from '../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { DispatchDueRemindersUseCase } from '../use-cases/reminders/dispatch-due-reminders.use-case.js';
import { ReminderDispatchWorker } from './reminder-dispatch.worker.js';

@Injectable()
export class TelegramReminderDispatchWorker extends ReminderDispatchWorker {
  constructor(
    private readonly telegramDispatchDueReminders: DispatchDueRemindersUseCase,
    logger: AppLogger,
    environmentProvider: RuntimeEnvironmentProvider,
  ) {
    super(telegramDispatchDueReminders, logger, environmentProvider);
  }

  override async runOnce() {
    try {
      return await this.telegramDispatchDueReminders.execute(ReminderDeliveryChannel.Telegram);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

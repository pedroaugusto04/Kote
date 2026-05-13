import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { AppLogger } from '../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../ports/runtime-environment.port.js';
import { DispatchDueTelegramRemindersUseCase } from '../use-cases/reminders/dispatch-due-telegram-reminders.use-case.js';

const ONE_MINUTE_MS = 60_000;

@Injectable()
export class TelegramReminderDispatchWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dispatchDueTelegramReminders: DispatchDueTelegramRemindersUseCase,
    private readonly logger: AppLogger,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  onModuleInit() {
    if (!this.shouldStart()) return;
    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, ONE_MINUTE_MS);
  }

  onModuleDestroy() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce() {
    try {
      return await this.dispatchDueTelegramReminders.execute();
    } catch (error) {
      this.logger.error('reminder.telegram_worker_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private shouldStart() {
    if (String(process.env.KB_DISABLE_REMINDER_WORKER || '').trim().toLowerCase() === 'true') return false;
    return Boolean(this.environmentProvider.read().databaseUrl);
  }
}

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { ReminderDeliveryChannel } from '../../contracts/enums.js';
import { AppLogger } from '../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { DispatchDueRemindersUseCase } from '../use-cases/reminders/dispatch-due-reminders.use-case.js';

const ONE_MINUTE_MS = 60_000;

@Injectable()
export class ReminderDispatchWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dispatchDueReminders: DispatchDueRemindersUseCase,
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
      return await this.dispatchDueReminders.execute(ReminderDeliveryChannel.Whatsapp);
    } catch (error) {
      this.logger.error('reminder.worker_failed', {
        channel: ReminderDeliveryChannel.Whatsapp,
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

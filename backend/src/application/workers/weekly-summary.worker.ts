import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WeeklySummaryService } from '../services/content/weekly-summary.service.js';
import { AppLogger } from '../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';

const ONE_MINUTE_MS = 60_000;

@Injectable()
export class WeeklySummaryWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private lastRunIso: string | null = null;

  constructor(
    private readonly weeklySummary: WeeklySummaryService,
    private readonly logger: AppLogger,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  onModuleInit() {
    if (!this.shouldStart()) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), ONE_MINUTE_MS);
  }

  onModuleDestroy() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private shouldStart() {
    if (String(process.env.KB_WEEKLY_SUMMARY_ENABLED || '').trim().toLowerCase() === 'false') return false;
    return Boolean(this.environmentProvider.read().databaseUrl);
  }

  private async tick() {
    try {
      const now = new Date();
      const utcDay = now.getUTCDay(); // 1 == Monday
      const utcHour = now.getUTCHours();
      const utcMinute = now.getUTCMinutes();

      // default: run Monday 08:00 UTC
      if (utcDay !== 1 || utcHour !== 8 || utcMinute !== 0) return;

      const todayIso = now.toISOString().slice(0,10);
      if (this.lastRunIso === todayIso) return;

      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0,0,0));
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

      await this.weeklySummary.runForRange(start.toISOString(), end.toISOString());
      this.lastRunIso = todayIso;
    } catch (err) {
      this.logger.error('weekly_summary.worker_failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

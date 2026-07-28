import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

import { DependencyWatcherService } from '../services/dependency-watcher/dependency-watcher.service.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../observability/logger.js';

const ONE_MINUTE_MS = 60 * 1000;

@Injectable()
export class DependencyWatcherWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dependencyWatcherService: DependencyWatcherService,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), ONE_MINUTE_MS);
    this.logger.info('dependency_watcher_worker_started');
  }

  onModuleDestroy() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.logger.info('dependency_watcher_worker_stopped');
  }

  private async tick() {
    const env = this.environmentProvider.read();
    const cronParts = env.dependencyWatcherCron.split(' ');
    
    if (cronParts.length !== 5) {
      this.logger.error('dependency_watcher_invalid_cron', { cron: env.dependencyWatcherCron });
      return;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = cronParts;
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();
    const currentDayOfMonth = now.getDate();
    const currentMonth = now.getMonth() + 1;
    const currentDayOfWeek = now.getDay();

    const matchesCron =
      (minute === '*' || parseInt(minute) === currentMinute) &&
      (hour === '*' || parseInt(hour) === currentHour) &&
      (dayOfMonth === '*' || parseInt(dayOfMonth) === currentDayOfMonth) &&
      (month === '*' || parseInt(month) === currentMonth) &&
      (dayOfWeek === '*' || parseInt(dayOfWeek) === currentDayOfWeek);

    if (!matchesCron) return;

    this.logger.info('dependency_watcher_check_started');

    try {
      const result = await this.dependencyWatcherService.runCheck(env.dependencyWatcherCheckIntervalHours);
      
      this.logger.info('dependency_watcher_check_completed', {
        queued: result.queued,
        workspaces: result.workspaces,
      });
    } catch (error) {
      this.logger.error('dependency_watcher_check_failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

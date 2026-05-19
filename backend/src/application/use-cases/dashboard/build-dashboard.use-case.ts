import { Injectable } from '@nestjs/common';
import { ContentQueryRepository, ContentRepository } from '../../ports/content.repository.js';
import { buildDashboardHome } from '../../utils/dashboard-home.utils.js';
import { RefreshReminderStatusesUseCase } from '../reminders/refresh-reminder-statuses.use-case.js';

export { buildDashboardHome };

@Injectable()
export class BuildDashboardUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly refreshReminderStatuses: RefreshReminderStatusesUseCase,
  ) {}

  async execute(userId: string) {
    const [workspaces, projects, notes, reviews, rawReminders] = await Promise.all([
      this.contentRepository.listWorkspaces(userId),
      this.contentRepository.listProjects(userId),
      this.contentQueryRepository.list(userId),
      this.contentQueryRepository.listReviews(userId),
      this.contentQueryRepository.listReminders(userId),
    ]);
    const reminders = await this.refreshReminderStatuses.execute(userId, rawReminders);
    return { workspaces, projects, home: buildDashboardHome(projects, notes, reviews, reminders) };
  }
}

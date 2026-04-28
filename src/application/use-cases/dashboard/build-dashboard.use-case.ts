import { Injectable } from '@nestjs/common';

import { ContentQueryRepository, ContentRepository } from '../../ports/repositories.js';
import { buildDashboardHome } from '../../utils/dashboard-home.utils.js';

export { buildDashboardHome };

@Injectable()
export class BuildDashboardUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentQueryRepository: ContentQueryRepository,
  ) {}

  async execute(userId: string) {
    const [workspaces, projects, notes, reviews, reminders] = await Promise.all([
      this.contentRepository.listWorkspaces(userId),
      this.contentRepository.listProjects(userId),
      this.contentQueryRepository.list(userId),
      this.contentQueryRepository.listReviews(userId),
      this.contentQueryRepository.listReminders(userId),
    ]);
    return { workspaces, projects, notes, reviews, reminders, home: buildDashboardHome(projects, notes, reviews, reminders) };
  }
}

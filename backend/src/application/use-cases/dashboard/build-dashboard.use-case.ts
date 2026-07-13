import { Injectable } from '@nestjs/common';
import { ContentQueryRepository, ContentRepository } from '../../ports/notes/content.repository.js';
import { buildDashboardHome } from '../../utils/dashboard/dashboard-home.utils.js';
import { RefreshReminderStatusesUseCase } from '../reminders/refresh-reminder-statuses.use-case.js';
import { formatDateInTimeZone } from '../../../domain/time.js';
import { AskHistoryRepository } from '../../ports/query/ask-history.repository.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export { buildDashboardHome };

@Injectable()
export class BuildDashboardUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly refreshReminderStatuses: RefreshReminderStatusesUseCase,
    private readonly askHistoryRepository?: AskHistoryRepository,
    private readonly projectBriefHistoryRepository?: ProjectBriefHistoryRepository,
  ) { }

  async execute(userId: string) {
    const [workspaces, projects, notes, reviews, rawReminders, askHistoryResult, projectBriefsCount] = await Promise.all([
      this.contentRepository.listWorkspaces(userId),
      this.contentRepository.listProjectsWithNoteCount(userId),
      this.contentQueryRepository.list(userId),
      this.contentQueryRepository.listReviews(userId),
      this.contentQueryRepository.listReminders(userId),
      this.askHistoryRepository
        ? this.askHistoryRepository.list({ userId, page: 1, pageSize: 1 }).catch(() => null)
        : null,
      this.projectBriefHistoryRepository
        ? this.projectBriefHistoryRepository.countByUser(userId).catch(() => 0)
        : 0,
    ]);

    const totalAskQueries = askHistoryResult?.pagination?.total ?? 0;
    const totalProjectBriefs = projectBriefsCount ?? 0;

    const zone = 'UTC';
    const now = new Date();
    const end = formatDateInTimeZone(now, zone);
    const start = shiftDateKey(end, -(7 - 1));
    const dayKeys = Array.from({ length: 7 }, (_, index) => shiftDateKey(start, index));

    const enrichedProjects = projects.map((project) => {
      const projectNotes = notes.filter((n) => n.project === project.projectSlug);
      const countsByDay = new Map<string, number>();
      for (const note of projectNotes) {
        const match = note.date.match(/^\d{4}-\d{2}-\d{2}/);
        if (match) {
          const key = match[0];
          countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
        }
      }
      const activitySparkline = dayKeys.map((date) => ({
        date,
        count: countsByDay.get(date) || 0,
      }));
      return {
        ...project,
        workspaceSlug: project.workspaceSlug || '',
        repositories: project.repositories.map((repo) => ({
          ...repo,
          workspaceSlug: project.workspaceSlug || '',
        })),
        activitySparkline,
      };
    });

    const reminders = await this.refreshReminderStatuses.execute(userId, rawReminders);
    return {
      workspaces,
      projects: enrichedProjects,
      home: buildDashboardHome(
        enrichedProjects,
        notes,
        reviews,
        reminders,
        now,
        zone,
        totalAskQueries,
        totalProjectBriefs,
      ),
    };
  }
}

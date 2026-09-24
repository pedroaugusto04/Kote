import { Injectable } from '@nestjs/common';
import { ContentQueryRepository, ContentRepository } from '../../ports/notes/content.repository.js';
import { buildDashboardHome } from '../../utils/dashboard/dashboard-home.utils.js';
import { RefreshReminderStatusesUseCase } from '../reminders/refresh-reminder-statuses.use-case.js';
import { formatDateInTimeZone, shiftDateKey } from '../../../domain/time.js';
import { AskHistoryRepository } from '../../ports/query/ask-history.repository.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';
import { ProjectCoverageRepository } from '../../ports/projects/project-coverage.repository.js';

export { buildDashboardHome };

@Injectable()
export class BuildDashboardUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly refreshReminderStatuses: RefreshReminderStatusesUseCase,
    private readonly projectCoverageRepository: ProjectCoverageRepository,
    private readonly askHistoryRepository?: AskHistoryRepository,
    private readonly projectBriefHistoryRepository?: ProjectBriefHistoryRepository,
  ) { }

  async execute(userId: string) {
    const [workspaces, projects, bundle, askHistoryResult, projectBriefsCount] = await Promise.all([
      this.contentRepository.listWorkspaces(userId),
      this.contentRepository.listProjectsWithNoteCount(userId),
      this.contentQueryRepository.listDashboardBundle
        ? this.contentQueryRepository.listDashboardBundle(userId)
        : Promise.all([
            this.contentQueryRepository.list(userId),
            this.contentQueryRepository.listReviews(userId),
            this.contentQueryRepository.listReminders(userId),
          ]).then(([notes, reviews, reminders]) => ({ notes, reviews, reminders })),
      this.askHistoryRepository
        ? this.askHistoryRepository.list({ userId, page: 1, pageSize: 1 }).catch(() => null)
        : null,
      this.projectBriefHistoryRepository
        ? this.projectBriefHistoryRepository.countByUser(userId).catch(() => 0)
        : 0,
    ]);

    const { notes, reviews, reminders: rawReminders } = bundle;
    const totalAskQueries = askHistoryResult?.pagination?.total ?? 0;
    const totalProjectBriefs = projectBriefsCount ?? 0;

    const zone = 'UTC';
    const now = new Date();
    const end = formatDateInTimeZone(now, zone);
    const start = shiftDateKey(end, -(7 - 1));
    const dayKeys = Array.from({ length: 7 }, (_, index) => shiftDateKey(start, index));
    const coverageMap = await this.resolveProjectsCoverageMap(userId, projects);

    const notesByProject = new Map<string, typeof notes>();
    for (const note of notes) {
      const projectNotes = notesByProject.get(note.project);
      if (projectNotes) projectNotes.push(note);
      else notesByProject.set(note.project, [note]);
    }

    const enrichedProjects = projects.map((project) => {
      const projectNotes = notesByProject.get(project.projectSlug) || [];
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
        coveragePercentage: coverageMap.get(project.projectSlug) || 0,
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

  private async resolveProjectsCoverageMap(
    userId: string,
    projects: { id: string; projectSlug: string }[],
  ): Promise<Map<string, number>> {
    const coverageMap = new Map<string, number>();
    if (!this.projectCoverageRepository || projects.length === 0) {
      return coverageMap;
    }

    if (this.projectCoverageRepository.getProjectsCoveragePercentage) {
      try {
        const projectIds = projects.map((p) => p.id).filter(Boolean);
        const percentageById = await this.projectCoverageRepository.getProjectsCoveragePercentage(userId, projectIds);
        for (const project of projects) {
          const pct = percentageById.get(project.id) ?? 0;
          coverageMap.set(project.projectSlug, pct);
          coverageMap.set(project.id, pct);
        }
        return coverageMap;
      } catch {
        return coverageMap;
      }
    }

    const coverageResults = await Promise.all(
      projects.map(async (project) => {
        try {
          const res = await this.projectCoverageRepository!.getProjectCoverage(userId, project.id);
          return { projectSlug: project.projectSlug, coveragePercentage: res.coveragePercentage };
        } catch {
          return { projectSlug: project.projectSlug, coveragePercentage: 0 };
        }
      }),
    );

    for (const res of coverageResults) {
      coverageMap.set(res.projectSlug, res.coveragePercentage);
    }
    return coverageMap;
  }
}

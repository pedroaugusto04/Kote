import type { ProjectBriefHistoryRecord, SaveProjectBriefHistoryInput } from '../../models/project-brief.models.js';

export abstract class ProjectBriefHistoryRepository {
  abstract save(input: SaveProjectBriefHistoryInput): Promise<ProjectBriefHistoryRecord>;
  abstract findLatest(input: {
    userId: string;
    workspaceSlug: string;
    projectSlug: string;
  }): Promise<ProjectBriefHistoryRecord | null>;
}

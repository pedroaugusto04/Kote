import type { PaginatedResult } from '../../../contracts/pagination.js';
import type { ProjectBriefHistoryRecord, SaveProjectBriefHistoryInput } from '../../models/project-brief.models.js';

export abstract class ProjectBriefHistoryRepository {
  abstract save(input: SaveProjectBriefHistoryInput): Promise<ProjectBriefHistoryRecord>;
  abstract findLatest(input: {
    userId: string;
    workspaceSlug: string;
    projectSlug: string;
  }): Promise<ProjectBriefHistoryRecord | null>;
  abstract list(input: {
    userId: string;
    workspaceSlug: string;
    projectSlug: string;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResult<ProjectBriefHistoryRecord>>;
  abstract countByUser(userId: string): Promise<number>;
}

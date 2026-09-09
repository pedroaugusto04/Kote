import type { ProjectCoverageResult } from '../../models/project-coverage.models.js';

export abstract class ProjectCoverageRepository {
  abstract getProjectCoverage(userId: string, projectId: string): Promise<ProjectCoverageResult>;
  abstract syncProjectFiles(projectId: string, filePaths: string[]): Promise<void>;
  abstract getProjectsCoveragePercentage?(userId: string, projectIds: string[]): Promise<Map<string, number>>;
}

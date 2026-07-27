import type { ProjectCoverageResult } from '../../models/project-coverage.models.js';

export abstract class ProjectCoverageRepository {
  abstract getProjectCoverage(userId: string, projectId: string): Promise<ProjectCoverageResult>;
  abstract syncProjectFiles(projectId: string, filePaths: string[]): Promise<void>;
}

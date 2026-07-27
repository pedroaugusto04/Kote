import { Injectable } from '@nestjs/common';
import { ProjectCoverageRepository } from '../../ports/projects/project-coverage.repository.js';
import type { ProjectCoverageResult } from '../../models/project-coverage.models.js';
import { SyncProjectFilesService } from '../../services/projects/sync-project-files.service.js';

@Injectable()
export class GetProjectCoverageUseCase {
  constructor(
    private readonly projectCoverageRepository: ProjectCoverageRepository,
    private readonly syncProjectFilesService?: SyncProjectFilesService,
  ) {}

  async execute(userId: string, input: { projectId: string; workspaceSlug?: string }): Promise<ProjectCoverageResult> {
    let res = await this.projectCoverageRepository.getProjectCoverage(userId, input.projectId);
    if (res.totalFiles === 0 && this.syncProjectFilesService) {
      try {
        const syncedCount = await this.syncProjectFilesService.syncProject(userId, input.projectId);
        if (syncedCount > 0) {
          res = await this.projectCoverageRepository.getProjectCoverage(userId, input.projectId);
        }
      } catch {
        // Fallback to initial result if sync fails
      }
    }
    return res;
  }
}

import { Injectable } from '@nestjs/common';
import { ProjectCoverageRepository } from '../../ports/projects/project-coverage.repository.js';
import type { ProjectCoverageResult } from '../../models/project-coverage.models.js';
import { SyncProjectFilesService } from '../../services/projects/sync-project-files.service.js';

@Injectable()
export class GetProjectCoverageUseCase {
  constructor(
    private readonly projectCoverageRepository: ProjectCoverageRepository,
    private readonly syncProjectFilesService: SyncProjectFilesService,
  ) {}

  async execute(userId: string, input: { projectId: string; workspaceSlug?: string; forceSync?: boolean }): Promise<ProjectCoverageResult> {
    if (input.forceSync) {
      try {
        await this.syncProjectFilesService.syncProject(userId, input.projectId);
      } catch {
        // Fallback to initial result if sync fails
      }
    }
    return this.projectCoverageRepository.getProjectCoverage(userId, input.projectId);
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';

import type { PaginationInput } from '../../../contracts/pagination.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';

@Injectable()
export class ListProjectBriefHistoryUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly historyRepository: ProjectBriefHistoryRepository,
  ) {}

  async execute(userId: string, input: PaginationInput & { projectId: string }) {
    const { projectId, page, pageSize } = input;
    let workspaceSlug = '';
    let projectSlug = '';
    let isAll = false;
    if (projectId === 'all') {
      isAll = true;
      projectSlug = 'all';
      const workspaces = await this.contentRepository.listWorkspaces(userId);
      if (workspaces.length > 0) {
        workspaceSlug = workspaces[0].workspaceSlug;
      } else {
        throw new NotFoundException('workspace_not_found');
      }
    } else {
      const project = await this.contentRepository.getProjectById(userId, projectId);
      if (!project || !project.enabled) throw new NotFoundException('project_not_found');
      workspaceSlug = project.workspaceSlug || '';
      projectSlug = project.projectSlug;
    }

    return this.historyRepository.list({
      userId,
      workspaceSlug,
      projectSlug,
      projectId: isAll ? undefined : projectId,
      page,
      pageSize,
    });
  }
}

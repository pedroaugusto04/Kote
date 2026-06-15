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

  async execute(userId: string, input: PaginationInput & { projectSlug: string }) {
    const { projectSlug, page, pageSize } = input;
    let workspaceSlug = '';
    if (projectSlug === 'all') {
      const workspaces = await this.contentRepository.listWorkspaces(userId);
      if (workspaces.length > 0) {
        workspaceSlug = workspaces[0].workspaceSlug;
      } else {
        throw new NotFoundException('workspace_not_found');
      }
    } else {
      const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
      if (!project || !project.enabled) throw new NotFoundException('project_not_found');
      workspaceSlug = project.workspaceSlug;
    }

    return this.historyRepository.list({
      userId,
      workspaceSlug,
      projectSlug,
      page,
      pageSize,
    });
  }
}

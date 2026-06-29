import { Injectable, NotFoundException } from '@nestjs/common';

import { ProjectBriefSavedSource } from '../../models/project-brief.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';

@Injectable()
export class GetProjectBriefUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly historyRepository: ProjectBriefHistoryRepository,
  ) {}

  async execute(userId: string, projectId: string) {
    let workspaceId = '';
    let isAll = false;
    if (projectId === 'all') {
      isAll = true;
      const workspaces = await this.contentRepository.listWorkspaces(userId);
      if (workspaces.length > 0) {
        workspaceId = workspaces[0].id;
      } else {
        throw new NotFoundException('workspace_not_found');
      }
    } else {
      const project = await this.contentRepository.getProjectById(userId, projectId);
      if (!project || !project.enabled) throw new NotFoundException('project_not_found');
      workspaceId = project.workspaceId || '';
    }

    const latest = await this.historyRepository.findLatest({
      userId,
      workspaceId,
      projectId: isAll ? undefined : projectId,
    });

    return {
      ok: true as const,
      source: latest ? ProjectBriefSavedSource.History : ProjectBriefSavedSource.None,
      brief: latest?.brief || null,
    };
  }
}

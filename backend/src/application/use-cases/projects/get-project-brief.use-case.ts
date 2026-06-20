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

  async execute(userId: string, projectSlug: string) {
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
      workspaceSlug = project.workspaceSlug || '';
    }

    const latest = await this.historyRepository.findLatest({
      userId,
      workspaceSlug,
      projectSlug,
    });

    return {
      ok: true as const,
      source: latest ? ProjectBriefSavedSource.History : ProjectBriefSavedSource.None,
      brief: latest?.brief || null,
    };
  }
}

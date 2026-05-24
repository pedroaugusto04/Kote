import { Injectable, NotFoundException } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';

@Injectable()
export class GetProjectBriefUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly historyRepository: ProjectBriefHistoryRepository,
  ) {}

  async execute(userId: string, projectSlug: string) {
    const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const latest = await this.historyRepository.findLatest({
      userId,
      workspaceSlug: project.workspaceSlug,
      projectSlug: project.projectSlug,
    });

    return {
      ok: true as const,
      source: latest ? 'history' as const : 'none' as const,
      brief: latest?.brief || null,
    };
  }
}

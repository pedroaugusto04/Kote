import { Injectable } from '@nestjs/common';

import { ProjectBriefSavedSource } from '../../models/project-brief.models.js';
import { resolveProjectBriefScope } from '../../mappers/project-brief.mapper.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';

@Injectable()
export class GetProjectBriefUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly historyRepository: ProjectBriefHistoryRepository,
  ) {}

  async execute(userId: string, projectId: string, workspaceIdInput?: string) {
    const { isAll, workspaceId } = await resolveProjectBriefScope(
      this.contentRepository,
      userId,
      projectId,
      workspaceIdInput,
    );

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

import { Injectable } from '@nestjs/common';

import type { PaginationInput } from '../../../contracts/pagination.js';
import { resolveProjectBriefScope } from '../../mappers/project-brief.mapper.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';

@Injectable()
export class ListProjectBriefHistoryUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly historyRepository: ProjectBriefHistoryRepository,
  ) {}

  async execute(userId: string, input: PaginationInput & { projectId: string; workspaceId?: string }) {
    const { projectId, page, pageSize, workspaceId: workspaceIdInput } = input;
    const { isAll, workspaceId } = await resolveProjectBriefScope(
      this.contentRepository,
      userId,
      projectId,
      workspaceIdInput,
    );

    return this.historyRepository.list({
      userId,
      workspaceId,
      projectId: isAll ? undefined : projectId,
      page,
      pageSize,
    });
  }
}

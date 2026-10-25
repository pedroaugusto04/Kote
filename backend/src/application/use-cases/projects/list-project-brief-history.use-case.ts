import { Injectable } from '@nestjs/common';

import type { PaginationInput } from '../../../contracts/pagination.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ProjectBriefHistoryRepository } from '../../ports/projects/project-brief-history.repository.js';

@Injectable()
export class ListProjectBriefHistoryUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly historyRepository: ProjectBriefHistoryRepository,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  async execute(userId: string, input: PaginationInput & { projectId: string; workspaceId?: string }) {
    const { projectId, page, pageSize, workspaceId: workspaceIdInput } = input;
    const { isAll, workspaceId } = await this.scopeResolver.resolveProjectBriefScope(
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

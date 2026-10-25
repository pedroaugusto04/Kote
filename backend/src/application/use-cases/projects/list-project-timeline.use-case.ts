import { Injectable } from '@nestjs/common';

import type { ListProjectTimelineInput } from '../../models/project-timeline.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';

@Injectable()
export class ListProjectTimelineUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) { }

  async execute(userId: string, input: ListProjectTimelineInput) {
    if (input.projectId) {
      const project = await this.scopeResolver.resolveProject(userId, input.projectId);

      const normalizedFolderId = input.folderId?.trim() || '';
      if (normalizedFolderId) {
        const folderIds = await this.scopeResolver.resolveFolderDescendantIds(
          userId,
          project.id,
          normalizedFolderId,
        );

        return this.contentRepository.listProjectTimeline(userId, {
          ...input,
          projectId: project.id,
          folderId: undefined,
          folderIds,
        });
      }
    }

    return this.contentRepository.listProjectTimeline(userId, input);
  }
}

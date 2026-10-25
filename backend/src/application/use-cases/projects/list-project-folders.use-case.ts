import { Injectable } from '@nestjs/common';

import { buildProjectFolderTree } from '../../utils/content/project-folder.utils.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';

@Injectable()
export class ListProjectFoldersUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  async execute(projectId: string, userId: string) {
    const project = await this.scopeResolver.resolveProject(userId, projectId);

    const folders = await this.contentRepository.listProjectFolders(userId, projectId);
    return {
      ok: true as const,
      projectSlug: project.projectSlug,
      folders: buildProjectFolderTree(folders),
    };
  }
}

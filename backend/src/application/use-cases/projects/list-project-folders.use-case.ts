import { Injectable, NotFoundException } from '@nestjs/common';

import { buildProjectFolderTree } from '../../utils/project-folder.utils.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class ListProjectFoldersUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(projectSlug: string, userId: string) {
    const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const folders = await this.contentRepository.listProjectFolders(userId, projectSlug);
    return {
      ok: true as const,
      projectSlug,
      folders: buildProjectFolderTree(folders),
    };
  }
}

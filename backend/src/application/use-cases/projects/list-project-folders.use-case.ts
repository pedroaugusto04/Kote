import { Injectable, NotFoundException } from '@nestjs/common';

import { buildProjectFolderTree } from '../../utils/project-folder.utils.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class ListProjectFoldersUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(projectId: string, userId: string) {
    const project = await this.contentRepository.getProjectById(userId, projectId);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const folders = await this.contentRepository.listProjectFolders(userId, projectId);
    return {
      ok: true as const,
      projectSlug: project.projectSlug,
      folders: buildProjectFolderTree(folders),
    };
  }
}

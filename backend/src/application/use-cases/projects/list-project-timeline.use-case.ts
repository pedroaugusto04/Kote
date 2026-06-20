import { Injectable, NotFoundException } from '@nestjs/common';

import type { ListProjectTimelineInput } from '../../models/project-timeline.models.js';
import { collectFolderDescendantIds } from '../../utils/project-folder.utils.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class ListProjectTimelineUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, input: ListProjectTimelineInput) {
    if (input.projectId || input.projectSlug) {
      const project = input.projectId
        ? await this.contentRepository.getProjectById(userId, input.projectId)
        : await this.contentRepository.getProjectBySlug(userId, input.projectSlug || '');
      if (!project || !project.enabled) throw new NotFoundException('project_not_found');

      const normalizedFolderId = input.folderId?.trim() || '';
      if (normalizedFolderId) {
        const folders = await this.contentRepository.listProjectFolders(userId, project.id);
        const selectedFolder = folders.find((folder) => folder.id === normalizedFolderId);
        if (!selectedFolder) throw new NotFoundException('folder_not_found');

        return this.contentRepository.listProjectTimeline(userId, {
          ...input,
          projectId: project.id,
          folderId: undefined,
          folderIds: collectFolderDescendantIds(folders, normalizedFolderId),
        });
      }
    }

    return this.contentRepository.listProjectTimeline(userId, input);
  }
}

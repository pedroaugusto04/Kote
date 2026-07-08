import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { collectFolderDescendantIds } from '../../utils/project-folder.utils.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class DeleteProjectFolderUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(projectId: string, folderId: string, userId: string) {
    const project = await this.contentRepository.getProjectById(userId, projectId);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const folders = await this.contentRepository.listProjectFolders(userId, projectId);
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) throw new NotFoundException('folder_not_found');

    const descendantIds = collectFolderDescendantIds(folders, folder.id);
    const notes = await this.contentRepository.listNotesLite(userId);
    const hasNestedFolders = descendantIds.length > 1;
    const hasNotes = notes.some((note) => note.projectId === projectId && note.folderId && descendantIds.includes(note.folderId));
    if (hasNotes) throw new BadRequestException('folder_has_notes');
    if (hasNestedFolders) throw new BadRequestException('folder_not_empty');

    await this.contentRepository.deleteProjectFolder(userId, projectId, folderId);
    return { ok: true as const, folderId, projectSlug: project.projectSlug };
  }
}

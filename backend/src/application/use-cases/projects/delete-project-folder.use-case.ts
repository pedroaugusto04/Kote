import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { collectFolderDescendantIds } from '../../utils/project-folder.utils.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class DeleteProjectFolderUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(projectSlug: string, folderId: string, userId: string) {
    const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const folders = await this.contentRepository.listProjectFolders(userId, projectSlug);
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) throw new NotFoundException('folder_not_found');

    const descendantIds = collectFolderDescendantIds(folders, folder.id);
    const notes = await this.contentRepository.listNotes(userId);
    const hasNestedFolders = descendantIds.length > 1;
    const hasNotes = notes.some((note) => note.projectSlug === projectSlug && note.folderId && descendantIds.includes(note.folderId));
    if (hasNotes) throw new BadRequestException('folder_has_notes');
    if (hasNestedFolders) throw new BadRequestException('folder_not_empty');

    await this.contentRepository.deleteProjectFolder(userId, projectSlug, folderId);
    return { ok: true as const, folderId, projectSlug };
  }
}

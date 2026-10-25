import { BadRequestException, Injectable } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';
import { collectFolderDescendantIds } from '../../utils/content/project-folder.utils.js';

@Injectable()
export class DeleteProjectFolderUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  async execute(projectId: string, folderId: string, userId: string) {
    const project = await this.scopeResolver.resolveProject(userId, projectId);
    const folder = await this.scopeResolver.resolveProjectFolder(userId, projectId, folderId);
    const folders = await this.contentRepository.listProjectFolders(userId, projectId);

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

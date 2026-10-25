import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { CreateProjectFolderInput } from '../../models/project-folder-input.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { toFolderCreateInput } from '../../mappers/project-folder.mapper.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';

@Injectable()
export class CreateProjectFolderUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  async execute(input: CreateProjectFolderInput, userId: string) {
    const project = await this.scopeResolver.resolveProject(userId, input.projectId);

    const folders = await this.contentRepository.listProjectFolders(userId, project.id);
    const parentFolder = input.parentFolderId
      ? folders.find((folder) => folder.id === input.parentFolderId) || null
      : null;
    if (input.parentFolderId && !parentFolder) throw new NotFoundException('folder_parent_not_found');

    const folderInput = toFolderCreateInput(input, project.projectSlug, project.workspaceSlug, parentFolder?.fullSlugPath ?? '');
    
    if (folders.some((folder) => folder.parentFolderId === (parentFolder?.id || null) && folder.folderSlug === folderInput.folderSlug)) {
      throw new ConflictException({
        code: 'folder_slug_already_exists',
        details: { fieldErrors: { displayName: 'A folder with this name already exists at this level.' } },
      });
    }

    const folder = await this.contentRepository.upsertProjectFolder(userId, folderInput);

    return { ok: true as const, folder };
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { CreateProjectFolderInput } from '../../models/project-folder-input.models.js';
import { buildFolderFullSlugPath, folderSlugFromDisplayName } from '../../utils/project-folder.utils.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

import crypto from 'node:crypto';

@Injectable()
export class CreateProjectFolderUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(input: CreateProjectFolderInput, userId: string) {
    const project = input.projectId
      ? await this.contentRepository.getProjectById(userId, input.projectId)
      : await this.contentRepository.getProjectBySlug(userId, input.projectSlug || '');
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const folders = await this.contentRepository.listProjectFolders(userId, project.id);
    const parentFolder = input.parentFolderId
      ? folders.find((folder) => folder.id === input.parentFolderId) || null
      : null;
    if (input.parentFolderId && !parentFolder) throw new NotFoundException('folder_parent_not_found');

    const folderSlug = folderSlugFromDisplayName(input.displayName);
    if (folders.some((folder) => folder.parentFolderId === (parentFolder?.id || null) && folder.folderSlug === folderSlug)) {
      throw new ConflictException({
        code: 'folder_slug_already_exists',
        details: { fieldErrors: { displayName: 'A folder with this name already exists at this level.' } },
      });
    }

    const now = new Date().toISOString();
    const folder = await this.contentRepository.upsertProjectFolder(userId, {
      id: crypto.randomUUID(),
      projectId: project.id,
      projectSlug: project.projectSlug,
      workspaceSlug: project.workspaceSlug,
      parentFolderId: parentFolder?.id || null,
      displayName: input.displayName,
      folderSlug,
      fullSlugPath: buildFolderFullSlugPath(parentFolder?.fullSlugPath || '', folderSlug),
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true as const, folder };
  }
}

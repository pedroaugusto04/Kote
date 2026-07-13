import crypto from 'node:crypto';

import type { CreateProjectFolderInput } from '../models/project-folder-input.models.js';
import type { SaveProjectFolderInput, ProjectFolderRecord } from '../models/repository-records.models.js';
import { buildFolderFullSlugPath, folderSlugFromDisplayName } from '../utils/project-folder.utils.js';

export function toFolderCreateInput(
  input: CreateProjectFolderInput,
  projectSlug: string,
  workspaceSlug?: string,
  parentFolderFullSlugPath?: string
): SaveProjectFolderInput {
  const now = new Date().toISOString();
  const folderSlug = folderSlugFromDisplayName(input.displayName);
  const fullSlugPath = buildFolderFullSlugPath(parentFolderFullSlugPath ?? '', folderSlug);

  return {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    projectSlug,
    workspaceSlug,
    parentFolderId: input.parentFolderId || null,
    displayName: input.displayName,
    folderSlug,
    fullSlugPath,
    createdAt: now,
    updatedAt: now,
  };
}

export function toFolderUpdateRewrite(
  folder: ProjectFolderRecord,
  newParentFolderId: string | null,
  newDisplayName: string,
  newParentFullSlugPath?: string | null
): SaveProjectFolderInput {
  const folderSlug = folderSlugFromDisplayName(newDisplayName);
  const fullSlugPath = buildFolderFullSlugPath(newParentFullSlugPath || '', folderSlug);

  return {
    id: folder.id,
    projectId: folder.projectId,
    projectSlug: folder.projectSlug,
    workspaceSlug: folder.workspaceSlug,
    parentFolderId: newParentFolderId,
    displayName: newDisplayName,
    folderSlug,
    fullSlugPath,
    createdAt: folder.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

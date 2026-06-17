import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { rewriteNotePathForFolder } from '../../../domain/notes.js';
import type { UpdateProjectFolderInput } from '../../models/project-folder-input.models.js';
import type { NoteRecord, ProjectFolderRecord } from '../../models/repository-records.models.js';
import { buildFolderFullSlugPath, collectFolderDescendantIds, folderSlugFromDisplayName } from '../../utils/project-folder.utils.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

type FolderRewrite = {
  previous: ProjectFolderRecord;
  next: ProjectFolderRecord;
};

@Injectable()
export class UpdateProjectFolderUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(input: UpdateProjectFolderInput, userId: string) {
    const project = await this.contentRepository.getProjectBySlug(userId, input.projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const folders = await this.contentRepository.listProjectFolders(userId, input.projectSlug);
    const currentFolder = folders.find((folder) => folder.id === input.folderId);
    if (!currentFolder) throw new NotFoundException('folder_not_found');

    const descendantIds = new Set(collectFolderDescendantIds(folders, currentFolder.id));
    if (input.parentFolderId && descendantIds.has(input.parentFolderId)) {
      throw new BadRequestException('folder_cycle_not_allowed');
    }

    const parentFolder = input.parentFolderId
      ? folders.find((folder) => folder.id === input.parentFolderId) || null
      : null;
    if (input.parentFolderId && !parentFolder) throw new NotFoundException('folder_parent_not_found');

    const folderSlug = folderSlugFromDisplayName(input.displayName);
    if (folders.some((folder) => folder.id !== currentFolder.id && folder.parentFolderId === (parentFolder?.id || null) && folder.folderSlug === folderSlug)) {
      throw new ConflictException({
        code: 'folder_slug_already_exists',
        details: { fieldErrors: { displayName: 'Ja existe uma pasta com esse nome neste nivel.' } },
      });
    }

    const nextRootPath = buildFolderFullSlugPath(parentFolder?.fullSlugPath || '', folderSlug);
    const affectedFolders = folders.filter((folder) => descendantIds.has(folder.id));
    const rewrites = affectedFolders
      .sort((left, right) => left.fullSlugPath.length - right.fullSlugPath.length)
      .map((folder): FolderRewrite => {
        const nextFullSlugPath = folder.id === currentFolder.id
          ? nextRootPath
          : folder.fullSlugPath.replace(`${currentFolder.fullSlugPath}/`, `${nextRootPath}/`);
        return {
          previous: folder,
          next: {
            ...folder,
            parentFolderId: folder.id === currentFolder.id ? (parentFolder?.id || null) : folder.parentFolderId,
            displayName: folder.id === currentFolder.id ? input.displayName : folder.displayName,
            folderSlug: folder.id === currentFolder.id ? folderSlug : folder.folderSlug,
            fullSlugPath: nextFullSlugPath,
          },
        };
      });

    const notes = await this.contentRepository.listNotes(userId);
    const rewrittenByFolderId = new Map(rewrites.map((rewrite) => [rewrite.previous.id, rewrite]));
    const affectedNotes = notes.filter((note) => note.projectSlug === project.projectSlug && note.folderId && descendantIds.has(note.folderId));
    const updatedNotes = [];
    for (const note of affectedNotes) {
      const loadedNote = await this.contentRepository.getNoteById(userId, note.id);
      const rewrite = note.folderId ? rewrittenByFolderId.get(note.folderId) : null;
      if (!loadedNote || !rewrite) continue;
      updatedNotes.push(noteInputWithPath(loadedNote, rewriteNotePathForFolder(
        loadedNote.path,
        project.projectSlug,
        rewrite.previous.fullSlugPath,
        rewrite.next.fullSlugPath,
      )));
    }

    await this.contentRepository.updateProjectFolderTree(userId, {
      folders: rewrites.map((rewrite) => rewrite.next),
      notes: updatedNotes,
    });

    return { ok: true as const, folder: rewrites[0]?.next || currentFolder };
  }
}

function noteInputWithPath(note: NoteRecord, path: string) {
  return {
    id: note.id,
    path,
    type: note.type,
    title: note.title,
    projectSlug: note.projectSlug,
    workspaceSlug: note.workspaceSlug,
    folderId: note.folderId,
    status: note.status,
    tags: note.tags,
    occurredAt: note.occurredAt,
    sourceChannel: note.sourceChannel,
    summary: note.summary,
    markdown: note.markdown,
    markdownStorageKey: note.markdownStorageKey,
    frontmatter: note.frontmatter,
    metadata: note.metadata,
    source: note.source,
    sessionId: note.sessionId,
    reminderDate: note.reminderDate,
    reminderAt: note.reminderAt,
  };
}

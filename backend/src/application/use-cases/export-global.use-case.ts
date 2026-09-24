import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { createZipArchive, type ZipEntry } from '../../domain/utils/zip.utils.js';
import { ContentRepository } from '../ports/notes/content.repository.js';
import { ObjectStorage } from '../ports/notes/object-storage.js';
import { ContentObjectStorageService } from '../services/content/content-object-storage.service.js';
import {
  buildManifest,
  buildReadme,
  exportFileDate,
  json,
  toAttachmentMetadata,
  toExportedAttachment,
  toExportedNote,
  toNoteMetadata,
  toProjectData,
  toRepositoryData,
  toWorkspaceData,
} from '../services/export/global-export-formatter.js';
import type {
  AttachmentRecord,
  NoteRecord,
  ProjectFolderRecord,
  SaveProjectInput,
  SaveWorkspaceInput,
} from '../models/repository-records.models.js';

export type GlobalExportResult = {
  buffer: Buffer;
  filename: string;
  counts: {
    workspaces: number;
    projects: number;
    folders: number;
    categories: number;
    repositories: number;
    notes: number;
    noteLinks: number;
    attachments: number;
  };
};

function storageError(kind: 'markdown' | 'attachment'): InternalServerErrorException {
  return new InternalServerErrorException(`global_export_${kind}_unavailable`);
}

@Injectable()
export class ExportGlobalUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentObjectStorage: ContentObjectStorageService,
    private readonly objectStorage: ObjectStorage,
  ) { }

  async execute(userId: string): Promise<GlobalExportResult> {
    const [workspaces, projects, notes, attachments] = await Promise.all([
      this.contentRepository.listWorkspaces(userId),
      this.contentRepository.listProjectsForExport(userId),
      this.contentRepository.listNotes(userId),
      this.contentRepository.listAttachmentsForExport(userId),
    ]);

    const [folders, categories, repositories] = await Promise.all([
      this.loadFolders(userId, projects),
      this.loadCategories(userId, workspaces),
      this.loadRepositories(userId, workspaces),
    ]);
    const noteLinks = await this.contentRepository.listNoteLinksByNoteIds(userId, notes.map((note) => note.id));
    const hydratedNotes = await Promise.all(notes.map((note) => this.hydrateNote(note)));
    const exportedNotes = hydratedNotes.map(toExportedNote);
    const exportedAttachments = await Promise.all(attachments.map((attachment) => this.exportAttachment(attachment)));

    const entries: ZipEntry[] = [
      { path: 'README.md', content: buildReadme(), mtime: new Date() },
      {
        path: 'manifest.json',
        content: json(buildManifest({ workspaces, projects, folders, categories, repositories, notes: exportedNotes, noteLinks, attachments: exportedAttachments })),
        mtime: new Date(),
      },
      { path: 'data/workspaces.json', content: json(workspaces.map(toWorkspaceData)), mtime: new Date() },
      { path: 'data/projects.json', content: json(projects.map(toProjectData)), mtime: new Date() },
      { path: 'data/folders.json', content: json(folders.flat()), mtime: new Date() },
      { path: 'data/categories.json', content: json(categories.flat()), mtime: new Date() },
      { path: 'data/repositories.json', content: json(toRepositoryData(repositories.flat(), projects)), mtime: new Date() },
      { path: 'data/notes.json', content: json(exportedNotes.map(toNoteMetadata)), mtime: new Date() },
      { path: 'data/note-links.json', content: json(noteLinks), mtime: new Date() },
      { path: 'data/attachments.json', content: json(exportedAttachments.map(toAttachmentMetadata)), mtime: new Date() },
      ...exportedNotes.map((note) => ({
        path: note.markdownPath,
        content: note.markdown,
        mtime: exportFileDate(note.updatedAt || note.createdAt || note.occurredAt),
      })),
      ...exportedAttachments.map((attachment) => ({
        path: attachment.contentPath,
        content: attachment.bytes,
        mtime: exportFileDate(attachment.createdAt),
      })),
    ];

    const dateStamp = new Date().toISOString().split('T')[0];
    return {
      buffer: createZipArchive(entries),
      filename: `kote-export-${dateStamp}.zip`,
      counts: {
        workspaces: workspaces.length,
        projects: projects.length,
        folders: folders.flat().length,
        categories: categories.flat().length,
        repositories: repositories.flat().length,
        notes: exportedNotes.length,
        noteLinks: noteLinks.length,
        attachments: exportedAttachments.length,
      },
    };
  }

  private async hydrateNote(note: NoteRecord): Promise<NoteRecord> {
    if (!note.markdownStorageKey && note.markdown) return note;
    try {
      const hydrated = await this.contentObjectStorage.hydrateMarkdown(note);
      if (!hydrated.markdown && note.markdownStorageKey) throw new Error('empty_markdown');
      if (!hydrated.markdown && !note.markdown) throw new Error('missing_markdown');
      return hydrated;
    } catch {
      throw storageError('markdown');
    }
  }

  private async loadFolders(userId: string, projects: SaveProjectInput[]): Promise<ProjectFolderRecord[][]> {
    return Promise.all(projects.map((project) => this.contentRepository.listProjectFolders(userId, project.id)));
  }

  private async loadCategories(userId: string, workspaces: SaveWorkspaceInput[]) {
    return Promise.all(workspaces.map((workspace) => this.contentRepository.listCategories(userId, workspace.id)));
  }

  private async loadRepositories(userId: string, workspaces: SaveWorkspaceInput[]) {
    return Promise.all(workspaces.map((workspace) => this.contentRepository.listRepositories(userId, workspace.id)));
  }

  private async exportAttachment(attachment: AttachmentRecord) {
    if (!attachment.storageKey) throw storageError('attachment');
    let bytes: Buffer;
    try {
      bytes = await this.objectStorage.get(attachment.storageKey);
    } catch {
      throw storageError('attachment');
    }

    return toExportedAttachment(attachment, bytes);
  }
}

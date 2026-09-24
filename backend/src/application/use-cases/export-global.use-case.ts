import { Injectable } from '@nestjs/common';

import { createZipArchive, type ZipEntry } from '../../domain/utils/zip.utils.js';
import { ContentRepository } from '../ports/notes/content.repository.js';
import { ObjectStorage } from '../ports/notes/object-storage.js';
import { ContentObjectStorageService } from '../services/content/content-object-storage.service.js';
import {
  buildManifest,
  buildIndex,
  buildReadme,
  exportFileDate,
  json,
  type SkippedExportItem,
  toAttachmentMetadata,
  toExportedAttachment,
  toExportedNotes,
  toNoteData,
  toNoteLinkData,
  toCategoryData,
  toFolderData,
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

const GLOBAL_EXPORT_STORAGE_CONCURRENCY = 16;

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

type StorageErrorContext = {
  noteId?: string;
  attachmentId?: string;
  storageKey?: string;
};

function skippedStorageItem(kind: SkippedExportItem['kind'], id: string, context: StorageErrorContext, cause?: unknown): SkippedExportItem {
  return {
    kind,
    id,
    ...context,
    reason: cause instanceof Error ? cause.message : String(cause || 'unknown_storage_error'),
  };
}

async function mapWithConcurrency<T, R>(items: T[], mapper: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
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
    const allNoteLinks = await this.contentRepository.listNoteLinksByNoteIds(userId, notes.map((note) => note.id));
    const hydratedNoteResults = await mapWithConcurrency(
      notes,
      (note) => this.hydrateNote(note),
      GLOBAL_EXPORT_STORAGE_CONCURRENCY,
    );
    const hydratedNotes = hydratedNoteResults.flatMap((result) => result.note ? [result.note] : []);
    const exportedNotes = toExportedNotes(hydratedNotes);
    const notePathById = new Map(exportedNotes.map((note) => [note.id, note.markdownPath]));
    const attachmentResults = await mapWithConcurrency(
      attachments,
      (attachment) => this.exportAttachment(attachment, notePathById.get(attachment.noteId)),
      GLOBAL_EXPORT_STORAGE_CONCURRENCY,
    );
    const exportedAttachments = attachmentResults.flatMap((result) => result.attachment ? [result.attachment] : []);
    const skipped = [
      ...hydratedNoteResults.flatMap((result) => result.skipped ? [result.skipped] : []),
      ...attachmentResults.flatMap((result) => result.skipped ? [result.skipped] : []),
    ];
    const exportedNoteIds = new Set(exportedNotes.map((note) => note.id));
    const noteLinks = allNoteLinks
      .filter((link) => exportedNoteIds.has(link.noteId))
      .map((link) => toNoteLinkData(link, notePathById));

    const workspaceMap = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
    const projectMap = new Map(projects.map((project) => [project.id, project]));
    const foldersFlat = folders.flat();
    const folderMap = new Map(foldersFlat.map((folder) => [folder.id, folder]));
    const presentationContext = { workspaces: workspaceMap, projects: projectMap, folders: folderMap };
    const projectData = projects.map((project) => toProjectData(project, workspaceMap));
    const folderData = foldersFlat.map((folder) => toFolderData(folder, presentationContext));
    const categoryData = categories.flat().map((category) => toCategoryData(category, workspaceMap));
    const repositoryData = toRepositoryData(repositories.flat(), projects, workspaceMap);
    const attachmentPathsByNoteId = new Map<string, string[]>();
    for (const attachment of exportedAttachments) {
      const paths = attachmentPathsByNoteId.get(attachment.noteId) || [];
      paths.push(attachment.contentPath);
      attachmentPathsByNoteId.set(attachment.noteId, paths);
    }
    const noteData = exportedNotes.map((note) => toNoteData(note, presentationContext, attachmentPathsByNoteId.get(note.id) || []));
    const attachmentData = exportedAttachments.map((attachment) => toAttachmentMetadata(attachment, notePathById.get(attachment.noteId)));
    const workspaceData = workspaces.map(toWorkspaceData);
    const exportedAt = new Date().toISOString();
    const counts = {
      workspaces: workspaces.length,
      projects: projects.length,
      folders: folderData.length,
      categories: categoryData.length,
      repositories: repositoryData.length,
      notes: exportedNotes.length,
      noteLinks: noteLinks.length,
      attachments: exportedAttachments.length,
    };

    const entries: ZipEntry[] = [
      { path: 'README.md', content: buildReadme(), mtime: new Date() },
      {
        path: 'INDEX.md',
        content: buildIndex({ exportedAt, counts, projects: projectData, notes: noteData, attachments: attachmentData, skipped }),
        mtime: new Date(),
      },
      {
        path: 'manifest.json',
        content: json(buildManifest({ workspaces, projects, folders, categories, repositories, notes: exportedNotes, noteLinks, attachments: exportedAttachments, skipped })),
        mtime: new Date(),
      },
      { path: 'data/workspaces.json', content: json(workspaceData), mtime: new Date() },
      { path: 'data/projects.json', content: json(projectData), mtime: new Date() },
      { path: 'data/folders.json', content: json(folderData), mtime: new Date() },
      { path: 'data/categories.json', content: json(categoryData), mtime: new Date() },
      { path: 'data/repositories.json', content: json(repositoryData), mtime: new Date() },
      { path: 'data/notes.json', content: json(noteData), mtime: new Date() },
      { path: 'data/note-links.json', content: json(noteLinks), mtime: new Date() },
      { path: 'data/attachments.json', content: json(attachmentData), mtime: new Date() },
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
      counts,
    };
  }

  private async hydrateNote(note: NoteRecord): Promise<{ note?: NoteRecord; skipped?: SkippedExportItem }> {
    if (!note.markdownStorageKey) {
      if (note.markdown) return { note };
      return { skipped: skippedStorageItem('note', note.id, {}, new Error('missing_markdown_storage_key')) };
    }

    try {
      const hydrated = await this.contentObjectStorage.hydrateMarkdown(note);
      if (!hydrated.markdown) throw new Error('empty_markdown');
      return { note: hydrated };
    } catch (error) {
      return {
        skipped: skippedStorageItem('note', note.id, { storageKey: note.markdownStorageKey }, error),
      };
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

  private async exportAttachment(attachment: AttachmentRecord, notePath?: string): Promise<{ attachment?: Awaited<ReturnType<typeof toExportedAttachment>>; skipped?: SkippedExportItem }> {
    if (!attachment.storageKey) {
      return {
        skipped: skippedStorageItem('attachment', attachment.id, { noteId: attachment.noteId }, new Error('missing_attachment_storage_key')),
      };
    }
    let bytes: Buffer;
    try {
      bytes = await this.objectStorage.get(attachment.storageKey);
    } catch (error) {
      return {
        skipped: skippedStorageItem('attachment', attachment.id, {
          noteId: attachment.noteId,
          storageKey: attachment.storageKey,
        }, error),
      };
    }

    return { attachment: toExportedAttachment(attachment, bytes, notePath) };
  }
}

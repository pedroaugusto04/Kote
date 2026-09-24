import crypto from 'node:crypto';

import { slugify } from '../../../domain/strings.js';
import type {
  AttachmentRecord,
  NoteRecord,
  ProjectFolderRecord,
  RepositoryRecord,
  SaveProjectInput,
  SaveWorkspaceInput,
} from '../../models/repository-records.models.js';

export const GLOBAL_EXPORT_FORMAT_VERSION = '1.0';

export type ExportedNote = NoteRecord & {
  categoryIds: string[];
  markdownPath: string;
  markdownSha256: string;
};

export type ExportedAttachment = AttachmentRecord & {
  contentPath: string;
  sha256: string;
  bytes: Buffer;
};

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(body: Buffer | string): string {
  return crypto.createHash('sha256').update(body).digest('hex');
}

export function safeSegment(value: string | null | undefined, fallback: string): string {
  return slugify(value || '') || fallback;
}

export function safeAttachmentName(fileName: string, id: string): string {
  const cleaned = String(fileName || '').trim().replace(/[\\/\u0000-\u001f\u007f]+/g, '_');
  return cleaned || `attachment-${id}`;
}

export function toExportedNote(note: NoteRecord): ExportedNote {
  const workspaceSegment = safeSegment(note.workspaceSlug, 'default');
  const projectSegment = safeSegment(note.projectSlug, 'inbox');
  const markdown = note.markdown || '';
  return {
    ...note,
    categoryIds: note.categories.map((category) => category.id),
    markdownPath: `notes/${workspaceSegment}/${projectSegment}/${note.id}.md`,
    markdownSha256: sha256(markdown),
  };
}

export function toExportedAttachment(attachment: AttachmentRecord, bytes: Buffer): ExportedAttachment {
  return {
    ...attachment,
    contentPath: `attachments/${safeSegment(attachment.noteId, 'orphan')}/${safeAttachmentName(attachment.fileName, attachment.id)}`,
    sha256: sha256(bytes),
    bytes,
  };
}

export function toWorkspaceData(workspace: SaveWorkspaceInput) {
  return {
    id: workspace.id,
    userId: workspace.userId,
    workspaceSlug: workspace.workspaceSlug,
    displayName: workspace.displayName,
    dependencyWatcherEnabled: workspace.dependencyWatcherEnabled,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

export function toProjectData(project: SaveProjectInput) {
  return {
    id: project.id,
    projectSlug: project.projectSlug,
    displayName: project.displayName,
    workspaceId: project.workspaceId,
    workspaceSlug: project.workspaceSlug || null,
    enabled: project.enabled,
    favorite: project.favorite,
    defaultTags: project.defaultTags,
    repositoryIds: project.repositories.map((repository) => repository.id),
    createdAt: project.createdAt || null,
    updatedAt: project.updatedAt || null,
  };
}

export function toRepositoryData(repositories: RepositoryRecord[], projects: SaveProjectInput[]) {
  return repositories.map((repository) => ({
    ...repository,
    projectIds: projects
      .filter((project) => project.repositories.some((linkedRepository) => linkedRepository.id === repository.id))
      .map((project) => project.id),
  }));
}

export function toNoteMetadata(note: ExportedNote) {
  const { markdown: _markdown, categories: _categories, ...metadata } = note;
  return metadata;
}

export function toAttachmentMetadata(attachment: ExportedAttachment) {
  const { bytes: _bytes, ...metadata } = attachment;
  return metadata;
}

export function buildManifest(input: {
  workspaces: SaveWorkspaceInput[];
  projects: SaveProjectInput[];
  folders: ProjectFolderRecord[][];
  categories: unknown[][];
  repositories: RepositoryRecord[][];
  notes: ExportedNote[];
  noteLinks: unknown[];
  attachments: ExportedAttachment[];
}) {
  return {
    format: 'kote-global-export',
    version: GLOBAL_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      workspaces: input.workspaces.length,
      projects: input.projects.length,
      folders: input.folders.flat().length,
      categories: input.categories.flat().length,
      repositories: input.repositories.flat().length,
      notes: input.notes.length,
      noteLinks: input.noteLinks.length,
      attachments: input.attachments.length,
    },
    files: {
      notes: input.notes.map(({ id, markdownPath, markdownSha256 }) => ({ id, path: markdownPath, sha256: markdownSha256 })),
      attachments: input.attachments.map(({ id, noteId, contentPath, sha256: checksum, sizeBytes, mimeType }) => ({
        id,
        noteId,
        path: contentPath,
        sha256: checksum,
        sizeBytes,
        mimeType,
      })),
    },
  };
}

export function buildReadme(): string {
  return `# Kote global export\n\nThis package contains the portable knowledge and account structure available to the authenticated Kote account at export time.\n\n- Structural records are in \`data/*.json\`.\n- Each note keeps its original Markdown in \`notes/<workspace>/<project>/<note-id>.md\`.\n- Attachment bytes are in \`attachments/<note-id>/<original-file-name>\`; checksums and metadata are in \`data/attachments.json\` and \`manifest.json\`.\n- Stable IDs are preserved to support future imports.\n\nThis is a portability export, not a technical database backup or a restore package. It intentionally excludes Ask AI history, temporary conversations, project briefs, note syntheses, knowledge maps, coverage data, embeddings, search indexes, queues, OAuth credentials, tokens, cookies, password hashes, webhook secrets, billing data, and automation settings. Reminder dates and note statuses are included as note state.\n`;
}

export function exportFileDate(value?: string): Date {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

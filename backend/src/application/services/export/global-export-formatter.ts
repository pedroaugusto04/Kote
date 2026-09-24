import crypto from 'node:crypto';

import { formatDisplayToken, slugify } from '../../../domain/strings.js';
import type {
  AttachmentRecord,
  CategoryRecord,
  NoteRecord,
  NoteLinkRecord,
  ProjectFolderRecord,
  RepositoryRecord,
  SaveProjectInput,
  SaveWorkspaceInput,
} from '../../models/repository-records.models.js';

export const GLOBAL_EXPORT_FORMAT_VERSION = '1.1';

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

export type SkippedExportItem = {
  kind: 'note' | 'attachment';
  id: string;
  noteId?: string;
  storageKey?: string;
  reason: string;
};

export type ExportPresentationContext = {
  workspaces: ReadonlyMap<string, SaveWorkspaceInput>;
  projects: ReadonlyMap<string, SaveProjectInput>;
  folders: ReadonlyMap<string, ProjectFolderRecord>;
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

function noteFileStem(note: NoteRecord): string {
  return safeSegment(note.title, 'note');
}

export function toExportedNotes(notes: NoteRecord[]): ExportedNote[] {
  const pathsByNoteId = new Map<string, string>();
  const usedPaths = new Set<string>();
  const notesForPathAllocation = [...notes].sort((left, right) => left.id.localeCompare(right.id));

  for (const note of notesForPathAllocation) {
    const workspaceSegment = safeSegment(note.workspaceSlug, 'default');
    const projectSegment = safeSegment(note.projectSlug, 'inbox');
    const baseStem = noteFileStem(note);
    let stem = baseStem;
    let suffix = 2;
    let path = `notes/${workspaceSegment}/${projectSegment}/${stem}.md`;
    while (usedPaths.has(path)) {
      stem = `${baseStem}-${suffix++}`;
      path = `notes/${workspaceSegment}/${projectSegment}/${stem}.md`;
    }
    usedPaths.add(path);
    pathsByNoteId.set(note.id, path);
  }

  return notes.map((note) => toExportedNote(note, pathsByNoteId.get(note.id)));
}

export function toExportedNote(note: NoteRecord, markdownPath?: string): ExportedNote {
  const workspaceSegment = safeSegment(note.workspaceSlug, 'default');
  const projectSegment = safeSegment(note.projectSlug, 'inbox');
  const markdown = note.markdown || '';
  return {
    ...note,
    categoryIds: note.categories.map((category) => category.id),
    markdownPath: markdownPath || `notes/${workspaceSegment}/${projectSegment}/${noteFileStem(note)}.md`,
    markdownSha256: sha256(markdown),
  };
}

export function toExportedAttachment(attachment: AttachmentRecord, bytes: Buffer, notePath?: string): ExportedAttachment {
  const noteDirectory = notePath
    ? notePath.replace(/^notes\//, '').replace(/\.md$/, '')
    : safeSegment(attachment.noteId, 'orphan');
  return {
    ...attachment,
    contentPath: `attachments/${noteDirectory}/${safeAttachmentName(attachment.fileName, attachment.id)}`,
    sha256: sha256(bytes),
    bytes,
  };
}

export function toWorkspaceData(workspace: SaveWorkspaceInput) {
  return {
    name: workspace.displayName || workspace.workspaceSlug,
    slug: workspace.workspaceSlug,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

export function toProjectData(project: SaveProjectInput, workspaces: ReadonlyMap<string, SaveWorkspaceInput>) {
  const workspace = workspaces.get(project.workspaceId);
  return {
    name: project.displayName || project.projectSlug,
    slug: project.projectSlug,
    workspace: workspace?.displayName || project.workspaceSlug || project.workspaceId,
    workspaceSlug: project.workspaceSlug || workspace?.workspaceSlug || null,
    status: project.enabled ? 'Active' : 'Inactive',
    favorite: project.favorite,
    defaultTags: project.defaultTags,
    repositories: project.repositories.map((repository) => repository.fullName),
    createdAt: project.createdAt || null,
    updatedAt: project.updatedAt || null,
  };
}

export function toFolderData(folder: ProjectFolderRecord, context: ExportPresentationContext) {
  const project = context.projects.get(folder.projectId);
  const workspace = project ? context.workspaces.get(project.workspaceId) : undefined;
  const parent = folder.parentFolderId ? context.folders.get(folder.parentFolderId) : undefined;
  return {
    name: folder.displayName || folder.folderSlug,
    path: folder.fullSlugPath,
    parent: parent?.fullSlugPath || null,
    project: project?.displayName || folder.projectSlug || folder.projectId,
    projectSlug: project?.projectSlug || folder.projectSlug || null,
    workspace: workspace?.displayName || folder.workspaceSlug || null,
    workspaceSlug: workspace?.workspaceSlug || folder.workspaceSlug || null,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

export function toCategoryData(category: CategoryRecord, workspaces: ReadonlyMap<string, SaveWorkspaceInput>) {
  const workspace = workspaces.get(category.workspaceId);
  return {
    name: category.name,
    workspace: workspace?.displayName || category.workspaceId,
    workspaceSlug: workspace?.workspaceSlug || null,
    color: category.color,
    darkColor: category.colorDark,
    icon: category.icon,
    system: category.isSystem,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

export function toRepositoryData(
  repositories: RepositoryRecord[],
  projects: SaveProjectInput[],
  workspaces: ReadonlyMap<string, SaveWorkspaceInput>,
) {
  return repositories.map((repository) => ({
    name: repository.fullName,
    workspace: workspaces.get(repository.workspaceId)?.displayName || repository.workspaceSlug || repository.workspaceId,
    workspaceSlug: workspaces.get(repository.workspaceId)?.workspaceSlug || repository.workspaceSlug || null,
    url: repository.htmlUrl,
    description: repository.description,
    defaultBranch: repository.defaultBranch,
    projects: projects
      .filter((project) => project.repositories.some((linkedRepository) => linkedRepository.id === repository.id))
      .map((project) => ({ name: project.displayName || project.projectSlug, slug: project.projectSlug })),
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
  }));
}

const TECHNICAL_NOTE_METADATA_KEYS = new Set([
  'aiUsage',
  'bodySearchText',
  'changedFiles',
  'compareUrl',
  'eventType',
  'files',
  'headSha',
  'rawText',
  'repoFullName',
  'synthesis',
]);

function toCustomFields(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) => !TECHNICAL_NOTE_METADATA_KEYS.has(key) && value !== undefined && value !== null && value !== ''),
  );
}

export function toNoteData(note: ExportedNote, context: ExportPresentationContext, attachmentPaths: string[] = []) {
  const project = context.projects.get(note.projectId);
  const workspace = context.workspaces.get(note.workspaceId);
  const folder = note.folderId ? context.folders.get(note.folderId) : undefined;
  return {
    title: note.title || 'Untitled note',
    file: note.markdownPath,
    workspace: workspace?.displayName || note.workspaceSlug || note.workspaceId,
    workspaceSlug: workspace?.workspaceSlug || note.workspaceSlug || null,
    project: project?.displayName || note.projectSlug || note.projectId,
    projectSlug: project?.projectSlug || note.projectSlug || null,
    folder: folder?.fullSlugPath || null,
    categories: note.categories.map((category) => category.name),
    tags: note.tags,
    status: formatDisplayToken(note.status, 'Unknown'),
    date: note.occurredAt || null,
    origin: formatDisplayToken(note.sourceChannel || note.source, 'Unknown'),
    reminder: note.reminderAt || null,
    pinned: Boolean(note.isPinned),
    customFields: toCustomFields(note.metadata),
    attachments: attachmentPaths,
    createdAt: note.createdAt || null,
    updatedAt: note.updatedAt || null,
  };
}

export function toNoteLinkData(link: NoteLinkRecord, notePathById: ReadonlyMap<string, string>) {
  const details = Object.fromEntries(
    Object.entries(link.metadata || {}).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
  return {
    note: notePathById.get(link.noteId) || null,
    reference: link.target,
    ...(Object.keys(details).length > 0 ? { details } : {}),
    createdAt: link.createdAt,
  };
}

export function toAttachmentMetadata(attachment: ExportedAttachment, notePath?: string) {
  return {
    note: notePath || null,
    file: attachment.contentPath,
    name: attachment.fileName,
    type: attachment.mimeType,
    size: attachment.sizeBytes,
    checksum: attachment.sha256,
    addedAt: attachment.createdAt,
  };
}

export function buildManifest(input: {
  workspaces: SaveWorkspaceInput[];
  projects: SaveProjectInput[];
  folders: ProjectFolderRecord[][];
  categories: CategoryRecord[][];
  repositories: RepositoryRecord[][];
  notes: ExportedNote[];
  noteLinks: unknown[];
  attachments: ExportedAttachment[];
  skipped: SkippedExportItem[];
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
    skipped: input.skipped,
    identifiers: {
      workspaces: input.workspaces.map(({ id, workspaceSlug }) => ({ id, slug: workspaceSlug })),
      projects: input.projects.map(({ id, projectSlug, workspaceId }) => ({ id, slug: projectSlug, workspaceId })),
      folders: input.folders.flat().map(({ id, fullSlugPath, projectId, parentFolderId }) => ({ id, path: fullSlugPath, projectId, parentFolderId })),
      categories: input.categories.flat().map(({ id, name, workspaceId }) => ({ id, name, workspaceId })),
      repositories: input.repositories.flat().map(({ id, fullName, workspaceId }) => ({ id, name: fullName, workspaceId })),
    },
    files: {
      notes: input.notes.map(({ id, markdownPath, markdownSha256, projectId, workspaceId, folderId, categoryIds, source, sourceChannel, sessionId }) => ({
        id,
        path: markdownPath,
        sha256: markdownSha256,
        projectId,
        workspaceId,
        folderId,
        categoryIds,
        source,
        sourceChannel,
        ...(sessionId ? { sessionId } : {}),
      })),
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
  return `# Kote export\n\nThis ZIP is a readable snapshot of the knowledge and account structure available at export time. Start with \`INDEX.md\` for an overview and links to the notes.\n\n## Package contents\n\n- \`notes/\` contains the original Markdown of each note, organized by workspace and project. File names use the note title; duplicate titles receive a numeric suffix.\n- \`attachments/\` contains the original attachment files.\n- \`data/*.json\` contains readable workspace, project, folder, category, repository, note, link, and attachment information.\n- \`manifest.json\` contains counts, checksums, stable internal IDs, and the exact file mapping needed by a future importer.\n\nDates, statuses, tags, reminders, pins, origins, and custom note fields are preserved. Notes or attachments that could not be read from object storage are omitted and listed in \`manifest.json\` under \`skipped\`.\n\nThis is a portability export, not a technical database backup or a restore package. It intentionally excludes Ask AI history, temporary conversations, project briefs, note syntheses, knowledge maps, coverage data, embeddings, search indexes, queues, OAuth credentials, tokens, cookies, password hashes, webhook secrets, billing data, and automation settings.\n`;
}

function markdownCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\\|').replace(/\r?\n/g, ' ').trim() || '—';
}

export function buildIndex(input: {
  exportedAt: string;
  counts: Record<string, number>;
  projects: Array<{ name: string; workspace: string; status: string; favorite: boolean }>;
  notes: Array<{ title: string; workspace: string; project: string; status: string; date: string | null; file: string; tags: string[] }>;
  attachments: Array<{ name: string; note: string | null; file: string; size: number }>;
  skipped: SkippedExportItem[];
}): string {
  const countRows = Object.entries(input.counts)
    .map(([name, count]) => `| ${name} | ${count} |`)
    .join('\n');
  const projectRows = input.projects
    .map((project) => `| ${markdownCell(project.name)} | ${markdownCell(project.workspace)} | ${project.status}${project.favorite ? ' · Favorite' : ''} |`)
    .join('\n');
  const noteRows = input.notes
    .map((note) => `| [${markdownCell(note.title)}](./${note.file}) | ${markdownCell(note.workspace)} | ${markdownCell(note.project)} | ${markdownCell(note.status)} | ${markdownCell(note.date)} | ${markdownCell(note.tags.join(', '))} |`)
    .join('\n');
  const attachmentRows = input.attachments
    .map((attachment) => `| [${markdownCell(attachment.name)}](./${attachment.file}) | ${markdownCell(attachment.note)} | ${attachment.size} bytes |`)
    .join('\n');
  const skippedSection = input.skipped.length > 0
    ? `\n## Skipped content\n\n${input.skipped.map((item) => `- ${item.kind}: ${item.id} — ${item.reason}`).join('\n')}\n`
    : '';

  return [
    '# Kote export index',
    '',
    `Exported on **${input.exportedAt.split('T')[0]}**.`,
    '',
    '## Overview',
    '',
    '| Content | Count |',
    '| --- | ---: |',
    countRows,
    '',
    '## Projects',
    '',
    '| Project | Workspace | Status |',
    '| --- | --- | --- |',
    projectRows || '| — | — | — |',
    '',
    '## Notes',
    '',
    '| Note | Workspace | Project | Status | Date | Tags |',
    '| --- | --- | --- | --- | --- | --- |',
    noteRows || '| — | — | — | — | — | — |',
    '',
    '## Attachments',
    '',
    '| File | Note | Size |',
    '| --- | --- | ---: |',
    attachmentRows || '| — | — | — |',
    skippedSection,
  ].join('\n');
}

export function exportFileDate(value?: string): Date {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

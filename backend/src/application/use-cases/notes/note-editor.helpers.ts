import { renderFrontmatter } from '../../../domain/frontmatter.js';
import { relocateNotePath } from '../../../domain/notes.js';
import { normalizeMultiline, trimText } from '../../../domain/strings.js';
import type { UpdateNoteInput } from '../../models/note-input.models.js';
import type { NoteRecord, ProjectFolderRecord } from '../../models/repository-records.models.js';

export function buildNoteEditorState(note: NoteRecord) {
  return {
    canDelete: true,
    rawText: extractEditableRawText(note),
    reminderDate: String(note.metadata.reminderDate || '').trim(),
    reminderTime: String(note.metadata.reminderTime || '').trim(),
  };
}

export function buildUpdatedNote(note: NoteRecord, previousFolder: ProjectFolderRecord | null, nextFolder: ProjectFolderRecord | null, input: UpdateNoteInput) {
  const title = trimText(input.title, note.title || input.rawText);
  const rawText = normalizeMultiline(input.rawText);
  const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];
  const frontmatter = {
    ...note.frontmatter,
    type: note.type,
    workspace: note.workspaceSlug,
    project: note.projectSlug,
    status: note.status,
    tags,
    occurred_at: note.occurredAt,
  };
  const metadata = {
    ...note.metadata,
    rawText,
    reminderDate: input.reminderDate,
    reminderTime: input.reminderTime,
    reminderAt: input.reminderAt || '',
  };

  return {
    id: note.id,
    path: relocateNotePath(note.path, note.projectSlug, previousFolder?.fullSlugPath || '', nextFolder?.fullSlugPath || ''),
    type: note.type,
    title,
    projectSlug: note.projectSlug,
    workspaceSlug: note.workspaceSlug,
    folderId: nextFolder?.id || null,
    status: note.status,
    tags,
    occurredAt: note.occurredAt,
    sourceChannel: note.sourceChannel,
    summary: summarizeRawText(rawText, title),
    markdown: renderEditableMarkdown(frontmatter, title, rawText),
    frontmatter,
    metadata,
    origin: note.origin,
    source: note.source,
    links: note.links,
  };
}

export function extractEditableRawText(note: NoteRecord) {
  const fromMetadata = String(note.metadata.rawText || '').trim();
  if (fromMetadata) return fromMetadata;

  const normalized = normalizeMultiline(String(note.markdown || ''));
  const withoutFrontmatter = normalized.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  if (!withoutFrontmatter) return String(note.summary || '').trim();

  const lines = withoutFrontmatter.split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex !== -1) {
    const firstLine = lines[firstContentIndex].trim().replace(/^#\s+/, '');
    if (sameText(firstLine, note.title)) {
      lines.splice(firstContentIndex, 1);
      while (lines[firstContentIndex] === '') lines.splice(firstContentIndex, 1);
    }
  }

  return lines.join('\n').trim() || String(note.summary || '').trim();
}

function renderEditableMarkdown(frontmatter: Record<string, unknown>, title: string, rawText: string) {
  return [renderFrontmatter(frontmatter), `# ${title}`, '', rawText, ''].join('\n');
}

function summarizeRawText(rawText: string, fallbackTitle: string) {
  const collapsed = trimText(
    rawText
      .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
      .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
      .replace(/[`*_>#-]+/g, ' ')
      .replace(/\s+/g, ' '),
    fallbackTitle,
  );
  return collapsed.slice(0, 280);
}

function sameText(left: string, right: string) {
  return normalizeComparableText(left) === normalizeComparableText(right);
}

function normalizeComparableText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}

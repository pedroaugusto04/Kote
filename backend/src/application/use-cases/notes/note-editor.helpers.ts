import { normalizeManualNoteStatus } from '../../../domain/note-status.js';
import { CanonicalType } from '../../../contracts/enums.js';
import { buildUtcReminderFields } from '../../../domain/time.js';
import { renderFrontmatter } from '../../../domain/frontmatter.js';
import { relocateNotePath } from '../../../domain/notes.js';
import { normalizeComparableText, normalizeMultiline, trimText } from '../../../domain/strings.js';
import type { UpdateNoteInput } from '../../models/note-input.models.js';
import type { NoteRecord, ProjectFolderRecord } from '../../models/repository-records.models.js';

export function buildNoteEditorState(note: NoteRecord) {
  return {
    canDelete: true,
    rawText: extractEditableRawText(note),
    reminderDate: String(note.metadata.reminderDate || '').trim(),
    reminderTime: String(note.metadata.reminderTime || '').trim(),
    reminderAt: String(note.metadata.reminderAt || '').trim(),
  };
}

export function buildUpdatedNote(
  note: NoteRecord,
  previousFolder: ProjectFolderRecord | null,
  nextFolder: ProjectFolderRecord | null,
  input: UpdateNoteInput,
  reminderTimeZone: string,
) {
  const title = trimText(input.title, note.title || input.rawText);
  const rawText = stripTitleHeader(normalizeMultiline(input.rawText), title);
  const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];
  const noteType = normalizeCanonicalType(input.canonicalType, note.type);
  const reminderFields = buildUtcReminderFields({
    reminderDate: input.reminderDate,
    reminderTime: input.reminderTime,
    reminderAt: input.reminderAt,
    timeZone: reminderTimeZone,
  });
  const nextStatus = normalizeManualNoteStatus({
    requestedStatus: input.status,
    currentStatus: note.status,
    hadReminder: Boolean(String(note.metadata.reminderDate || '').trim() || String(note.metadata.reminderAt || '').trim()),
    hasReminder: Boolean(reminderFields.reminderDate || reminderFields.reminderAt),
  });
  const structuredNote = parseStructuredNoteMarkdown(note.markdown, note.title);
  const frontmatter = {
    ...note.frontmatter,
    type: noteType,
    workspace: note.workspaceSlug,
    project: note.projectSlug,
    status: nextStatus,
    tags,
    occurred_at: note.occurredAt,
  };
  const metadata = {
    ...note.metadata,
    rawText,
    reminderDate: reminderFields.reminderDate,
    reminderTime: reminderFields.reminderTime,
    reminderAt: reminderFields.reminderAt,
  };

  return {
    id: note.id,
    path: relocateNotePath(note.path, note.projectSlug, previousFolder?.fullSlugPath || '', nextFolder?.fullSlugPath || ''),
    type: noteType,
    title,
    projectSlug: note.projectSlug,
    workspaceSlug: note.workspaceSlug,
    folderId: nextFolder?.id || null,
    status: nextStatus,
    tags,
    occurredAt: note.occurredAt,
    sourceChannel: note.sourceChannel,
    summary: structuredNote?.summary || summarizeRawText(rawText, title),
    markdown: structuredNote
      ? renderStructuredMarkdown(frontmatter, title, rawText, structuredNote)
      : renderEditableMarkdown(frontmatter, title, rawText),
    frontmatter,
    metadata,
  };
}

function normalizeCanonicalType(value: string | undefined, fallback: string) {
  if (value && Object.values(CanonicalType).includes(value as CanonicalType)) return value;
  return fallback || CanonicalType.Event;
}

export function extractEditableRawText(note: NoteRecord) {
  const fromMetadata = String(note.metadata.rawText || '').trim();
  if (fromMetadata) return stripTitleHeader(fromMetadata, note.title);

  const structuredNote = parseStructuredNoteMarkdown(note.markdown, note.title);
  if (structuredNote?.rawText) return structuredNote.rawText;

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

function renderStructuredMarkdown(
  frontmatter: Record<string, unknown>,
  title: string,
  rawText: string,
  structuredNote: StructuredNoteMarkdown,
) {
  const sections = structuredNote.sections.map((section) =>
    normalizeComparableText(section.heading) === 'original text'
      ? { ...section, content: rawText ? rawText.split('\n') : [] }
      : section,
  );
  const body = [
    ...structuredNote.preamble,
    ...sections.flatMap((section) => [section.headingLine, ...section.content]),
  ];
  return [renderFrontmatter(frontmatter), `# ${title}`, '', ...trimBlankEdges(body), ''].join('\n');
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

export function stripTitleHeader(rawText: string, title: string): string {
  if (!title || !rawText) return rawText;
  const trimmedTitle = title.trim();
  const lines = rawText.split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex !== -1) {
    const firstLine = lines[firstContentIndex].trim();
    if (firstLine.startsWith('# ')) {
      const headingText = firstLine.substring(2).trim();
      const cleanHeading = headingText.replace(/\s*\(\d{4}-\d{2}-\d{2}\)$/, '');
      const cleanTitle = trimmedTitle.replace(/\s*\(\d{4}-\d{2}-\d{2}\)$/, '');
      if (
        cleanHeading.toLowerCase() === cleanTitle.toLowerCase() ||
        cleanHeading.toLowerCase() === 'unsaved note'
      ) {
        const remainingLines = [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)];
        while (remainingLines.length > 0 && remainingLines[0].trim() === '') {
          remainingLines.shift();
        }
        return remainingLines.join('\n');
      }
    }
  }
  return rawText;
}

type StructuredNoteSection = {
  heading: string;
  headingLine: string;
  content: string[];
};

type StructuredNoteMarkdown = {
  preamble: string[];
  sections: StructuredNoteSection[];
  rawText: string;
  summary: string;
};

function parseStructuredNoteMarkdown(markdown: string, title: string): StructuredNoteMarkdown | null {
  const normalized = normalizeMultiline(String(markdown || ''));
  const withoutFrontmatter = normalized.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  if (!withoutFrontmatter) return null;

  const lines = dropTitleHeading(withoutFrontmatter.split('\n'), title);
  const firstSectionIndex = lines.findIndex((line) => line.startsWith('## '));
  if (firstSectionIndex === -1) return null;

  const preamble = trimBlankEdges(lines.slice(0, firstSectionIndex));
  const sections: StructuredNoteSection[] = [];
  let current: StructuredNoteSection | null = null;

  for (const line of lines.slice(firstSectionIndex)) {
    if (line.startsWith('## ')) {
      if (current) sections.push({ ...current, content: trimBlankEdges(current.content) });
      current = {
        heading: line.slice(3).trim(),
        headingLine: line,
        content: [],
      };
      continue;
    }
    if (!current) continue;
    current.content.push(line);
  }
  if (current) sections.push({ ...current, content: trimBlankEdges(current.content) });

  const rawText = sectionText(sections, 'original text');
  const summary = sectionText(sections, 'summary');
  if (!rawText) return null;
  return { preamble, sections, rawText, summary };
}

function dropTitleHeading(lines: string[], title: string) {
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex === -1) return lines;
  const firstLine = lines[firstContentIndex].trim().replace(/^#\s+/, '');
  if (!sameText(firstLine, title)) return lines;
  const next = [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)];
  while (next[0] === '') next.shift();
  return next;
}

function sectionText(sections: StructuredNoteSection[], heading: string) {
  return sections
    .find((section) => normalizeComparableText(section.heading) === heading)
    ?.content.join('\n')
    .trim() || '';
}

function trimBlankEdges(lines: string[]) {
  const next = [...lines];
  while (next[0] === '') next.shift();
  while (next[next.length - 1] === '') next.pop();
  return next;
}

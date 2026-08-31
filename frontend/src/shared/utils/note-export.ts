import type { NoteDetail } from '../api/models/note';
import {
  DEFAULT_EXPORT_FILE_NAME,
  NOTE_EXPORT_FORMATS,
  NOTE_EXPORT_MIME_TYPES,
  type NoteExportFormat,
} from '../constants/export.constants';
import { sanitizeFileName } from './text';

export { sanitizeFileName };

export function buildNoteExportContent(
  note: Pick<NoteDetail, 'title' | 'markdown' | 'summary'> & { editor?: { rawText?: string } | null },
): string {
  if (note.markdown && note.markdown.trim()) {
    return note.markdown;
  }
  const title = note.title || 'Untitled Note';
  const body = note.editor?.rawText || note.summary || '';
  return `# ${title}\n\n${body}`.trim();
}

export function downloadNoteAsFile(
  note: Pick<NoteDetail, 'title' | 'markdown' | 'summary'> & { editor?: { rawText?: string } | null },
  format: NoteExportFormat = NOTE_EXPORT_FORMATS.MARKDOWN,
) {
  const content = buildNoteExportContent(note);
  const mimeType = NOTE_EXPORT_MIME_TYPES[format] || NOTE_EXPORT_MIME_TYPES[NOTE_EXPORT_FORMATS.MARKDOWN];
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const baseFileName = sanitizeFileName(note.title, DEFAULT_EXPORT_FILE_NAME);
  const fileName = `${baseFileName}.${format}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


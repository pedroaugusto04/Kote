export const NOTE_EXPORT_FORMATS = {
  MARKDOWN: 'md',
  TEXT: 'txt',
} as const;

export type NoteExportFormat = (typeof NOTE_EXPORT_FORMATS)[keyof typeof NOTE_EXPORT_FORMATS];

export const NOTE_EXPORT_MIME_TYPES: Record<NoteExportFormat, string> = {
  [NOTE_EXPORT_FORMATS.MARKDOWN]: 'text/markdown;charset=utf-8',
  [NOTE_EXPORT_FORMATS.TEXT]: 'text/plain;charset=utf-8',
};

export const DEFAULT_EXPORT_FILE_NAME = 'note';

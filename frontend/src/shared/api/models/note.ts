import type { NoteStatus } from './note-status';

export const canonicalNoteTypeValues = ['event', 'decision', 'followup', 'incident', 'knowledge'] as const;

export type CanonicalNoteType = (typeof canonicalNoteTypeValues)[number];

export type NoteSummary = {
  id: string;
  path: string;
  type: string;
  title: string;
  project: string;
  workspace: string;
  folderId: string | null;
  tags: string[];
  date: string;
  status: NoteStatus;
  summary: string;
  source: string;
  attachmentCount: number;
  isOverdue?: boolean;
};

export type NoteAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

export type NoteDetail = NoteSummary & {
  markdown: string;
  frontmatter: Record<string, unknown>;
  links: string[];
  origin: string;
  attachments: NoteAttachment[];
  editor: {
    canDelete: boolean;
    rawText: string;
    reminderDate: string;
    reminderTime: string;
    reminderAt: string;
  } | null;
};

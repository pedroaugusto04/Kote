import type { CategoryRecord } from './category';
import type { NoteStatus } from './note-status';

export type NoteSummary = {
  id: string;
  path: string;
  categories: CategoryRecord[];
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
  sourceChannel: string;
  attachmentCount: number;
  isOverdue?: boolean;
  isPinned?: boolean;
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
    reminderAt: string;
  } | null;
  navigation: {
    previous: { id: string; title: string } | null;
    next: { id: string; title: string } | null;
  };
};

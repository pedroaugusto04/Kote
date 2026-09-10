import type { CategoryRecord } from './category';
import type { NoteStatus } from './note-status';

export const NOTE_SYNTHESIS_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;

export type NoteSynthesisStatus = typeof NOTE_SYNTHESIS_STATUS[keyof typeof NOTE_SYNTHESIS_STATUS];

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
  synthesis?: {
    status: NoteSynthesisStatus;
    mode: string;
    overview: string;
    memory: Array<{ kind: string; text: string; status: string; turnRefs: number[] }>;
    availableAt?: string | null;
    generatedAt: string | null;
    sourceHash: string;
  } | null;
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

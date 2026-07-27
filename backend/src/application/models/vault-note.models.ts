import type { CategoryRecord } from './repository-records.models.js';

export type VaultNoteSummary = {
  id: string;
  path: string;
  categories: CategoryRecord[];
  type: string;
  title: string;
  projectId: string;
  workspaceId: string;
  project: string;
  workspace: string;
  folderId: string | null;
  tags: string[];
  date: string;
  status: string;
  summary: string;
  source: string;
  sourceChannel: string;
  attachmentCount: number;
  isPinned?: boolean;
  ftsRank?: number;
};

export type VaultNoteAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

export type VaultNoteDetail = VaultNoteSummary & {
  markdown: string;
  frontmatter: Record<string, unknown>;
  attachments: VaultNoteAttachment[];
  editor: {
    canDelete: boolean;
    rawText: string;
    reminderDate: string;
    reminderTime: string;
    reminderAt: string;
  } | null;
  navigation: {
    previous: { id: string; title: string } | null;
    next: { id: string; title: string } | null;
  };
};

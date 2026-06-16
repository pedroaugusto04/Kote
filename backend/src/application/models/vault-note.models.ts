export type VaultNoteSummary = {
  id: string;
  path: string;
  type: string;
  title: string;
  project: string;
  workspace: string;
  folderId: string | null;
  tags: string[];
  date: string;
  status: string;
  summary: string;
  source: string;
  attachmentCount: number;
  isPinned?: boolean;
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
};

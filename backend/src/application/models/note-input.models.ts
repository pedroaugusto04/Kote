export type CreateManualNoteInput = {
  projectSlug: string;
  folderId?: string;
  title: string;
  rawText: string;
  tags: string[];
  reminderDate: string;
  reminderTime: string;
  reminderAt?: string;
};

export type UpdateNoteInput = {
  id: string;
  folderId?: string;
  title: string;
  rawText: string;
  tags: string[];
  reminderDate: string;
  reminderTime: string;
  reminderAt?: string;
};

export type CreateManualNoteInput = {
  projectSlug: string;
  title: string;
  rawText: string;
  tags: string[];
  reminderDate: string;
  reminderTime: string;
};

export type UpdateManualNoteInput = {
  id: string;
  title: string;
  rawText: string;
  tags: string[];
  reminderDate: string;
  reminderTime: string;
};

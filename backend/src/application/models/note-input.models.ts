export type CreateManualNoteInput = {
  projectSlug: string;
  title: string;
  rawText: string;
  tags: string[];
  reminderDate: string;
  reminderTime: string;
};

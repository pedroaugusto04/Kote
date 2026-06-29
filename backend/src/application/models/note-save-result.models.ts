export type SavedNoteSummary = {
  id: string;
  title: string;
  type: string;
  status: string;
  projectSlug: string;
  projectName: string;
  workspaceSlug: string;
  folderId: string | null;
  folderName: string;
  folderPath: string;
  eventPath: string;
  reminderAt: string;
  hasReminder: boolean;
  attachmentCount: number;
};

export type SaveNoteResult = {
  ok: true;
  project: string;
  noteId: string;
  eventPath: string;
  canonicalPath: string;
  followupPath: string;
  dailyPath: string;
  attachmentIds: string[];
  assetPaths: string[];
  note: SavedNoteSummary;
};

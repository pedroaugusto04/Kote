export type SavedNoteSummary = {
  title: string;
  type: string;
  status: string;
  projectSlug: string;
  projectName: string;
  workspaceSlug: string;
  folderId: string | null;
  folderName: string;
  folderPath: string;
  path: string;
  reminderAt: string;
  hasReminder: boolean;
  attachmentCount: number;
};

export type SaveNoteResult = {
  ok: true;
  noteId: string;
  note: SavedNoteSummary;
};

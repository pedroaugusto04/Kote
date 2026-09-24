export type SessionHandoffInput = {
  rawText?: string;
  noteId?: string;
  provider?: string;
  projectSlug?: string;
  workspaceSlug?: string;
  autoDetectPrevious?: boolean;
};

export type SessionHandoffBody = SessionHandoffInput;

export type SessionHandoffResponse = {
  ok: true;
  handoffMarkdown: string;
  sourceProvider?: string;
  sourceNoteId?: string;
  sourceTimestamp?: string;
  sourceTitle?: string;
};

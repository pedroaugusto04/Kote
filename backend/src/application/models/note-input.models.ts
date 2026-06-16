import type { SourceChannel } from '../../contracts/enums.js';

export type CreateManualNoteInput = {
  projectSlug: string;
  folderId?: string;
  title: string;
  rawText: string;
  tags: string[];
  status?: string;
  canonicalType?: string;
  reminderDate: string;
  reminderTime: string;
  reminderAt?: string;
  sourceChannel?: SourceChannel;
  sessionId?: string;
};

export type UpdateNoteInput = {
  id: string;
  folderId?: string;
  title: string;
  rawText: string;
  tags: string[];
  status?: string;
  canonicalType?: string;
  reminderDate: string;
  reminderTime: string;
  reminderAt?: string;
};

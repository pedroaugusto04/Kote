import type { SourceChannel } from '../../contracts/enums.js';

export type CreateManualNoteInput = {
  folderId?: string;
  title: string;
  rawText: string;
  tags: string[];
  status?: string;
  categoryIds?: string[];
  reminderDate: string;
  reminderTime: string;
  reminderAt?: string;
  sourceChannel?: SourceChannel;
  source?: string;
  sessionId?: string;
};

export type UpdateNoteInput = {
  id: string;
  projectSlug?: string;
  folderId?: string;
  title: string;
  rawText: string;
  tags: string[];
  status?: string;
  categoryIds?: string[];
  reminderDate: string;
  reminderTime: string;
  reminderAt?: string;
};

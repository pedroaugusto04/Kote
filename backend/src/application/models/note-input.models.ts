import type { SourceChannel } from '../../contracts/enums.js';

export type CreateManualNoteInput = {
  folderId?: string;
  title: string;
  rawText: string;
  tags: string[];
  status?: string;
  categoryIds?: string[];
  reminderAt?: string;
  sourceChannel?: string;
  source?: string;
  sessionId?: string;
  occurredAt?: string;
  path?: string;
  metadata?: Record<string, any>;
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
  reminderAt?: string;
};

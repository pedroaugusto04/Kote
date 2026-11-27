import type { KnowledgeStatus } from '../../contracts/enums.js';
import type { NoteStatus } from '../../domain/note-status.js';

export type EditableNoteStatus =
  | KnowledgeStatus.Active
  | KnowledgeStatus.Resolved
  | KnowledgeStatus.Archived;

export type NoteAttachmentDto = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
};

type CommonNoteDtoFields = {
  folderId?: string;
  title: string;
  rawText: string;
  tags: string[];
  reminderAt: string;
};

export type CreateManualNoteDto = CommonNoteDtoFields & {
  projectId: string;
  status?: NoteStatus;
  categoryIds: string[];
  sourceChannel?: string;
  source?: string;
  sessionId: string;
  occurredAt?: string;
  path?: string;
  metadata: Record<string, unknown>;
  attachments: NoteAttachmentDto[];
};

export type UpdateNoteDto = CommonNoteDtoFields & {
  id: string;
  projectId?: string;
  status?: EditableNoteStatus;
  categoryIds?: string[];
  attachments?: NoteAttachmentDto[];
};

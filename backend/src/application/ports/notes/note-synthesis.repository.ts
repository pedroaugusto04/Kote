import type { NoteSynthesisRecord, NoteSynthesisItem } from '../../models/note-synthesis.models.js';

export abstract class NoteSynthesisRepository {
  abstract upsertPending(input: { userId: string; noteId: string; sourceHash: string; mode?: 'ai' | 'deterministic'; force?: boolean }, tx?: any): Promise<NoteSynthesisRecord>;
  abstract markProcessing(userId: string, noteId: string, sourceHash: string): Promise<void>;
  abstract markCompleted(input: { userId: string; noteId: string; sourceHash: string; mode: 'ai' | 'deterministic'; overview: string; memory: NoteSynthesisItem[]; provider: string; model: string }): Promise<NoteSynthesisRecord>;
  abstract markFailed(userId: string, noteId: string, sourceHash: string, errorCode: string): Promise<void>;
  abstract markSkipped(userId: string, noteId: string, sourceHash: string, errorCode: string): Promise<void>;
  abstract getByNoteId(userId: string, noteId: string): Promise<NoteSynthesisRecord | null>;
}

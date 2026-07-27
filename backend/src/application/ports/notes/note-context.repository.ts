import { NoteRecord } from '../../models/repository-records.models.js';

export abstract class NoteContextRepository {
  abstract findNotesByFile(userId: string, filePath: string, options?: { limit?: number }): Promise<NoteRecord[]>;
}

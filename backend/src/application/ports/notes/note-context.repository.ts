import { NoteRecord } from '../../models/repository-records.models.js';

export type FindNotesByFileOptions = {
  limit?: number;
  projectSlug?: string;
  commitHashes?: string[];
};

export abstract class NoteContextRepository {
  abstract findNotesByFile(userId: string, filePath: string, options?: FindNotesByFileOptions): Promise<NoteRecord[]>;
}

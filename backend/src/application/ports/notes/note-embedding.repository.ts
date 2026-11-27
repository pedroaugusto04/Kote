export const EmbeddingRepresentation = {
  Raw: 'raw',
  Synthesis: 'synthesis',
} as const;

export type EmbeddingRepresentation = typeof EmbeddingRepresentation.Raw | typeof EmbeddingRepresentation.Synthesis;

export type NoteEmbeddingRecord = {
  id: string;
  userId: string;
  noteId: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  model: string;
  createdAt: string;
  updatedAt: string;
  representation?: EmbeddingRepresentation;
  sourceRefs?: number[];
};

export type SimilarChunk = NoteEmbeddingRecord & {
  similarity: number;
};

export type FindSimilarOptions = {
  limit: number;
  minSimilarity: number;
  workspaceId?: string;
  projectId?: string;
  representation: EmbeddingRepresentation;
};

export abstract class NoteEmbeddingRepository {
  abstract upsertChunks(
    userId: string,
    noteId: string,
    chunks: Array<Omit<NoteEmbeddingRecord, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void>;

  abstract deleteByNoteId(userId: string, noteId: string): Promise<void>;
  abstract deleteByNoteIdAndRepresentation(userId: string, noteId: string, representation: EmbeddingRepresentation): Promise<void>;

  abstract findSimilar(
    userId: string,
    queryEmbedding: number[],
    options: FindSimilarOptions,
  ): Promise<SimilarChunk[]>;

  abstract getNoteEmbeddings(userId: string, noteId: string): Promise<NoteEmbeddingRecord[]>;

  abstract getNotesEmbeddings(userId: string, noteIds: string[]): Promise<NoteEmbeddingRecord[]>;
}

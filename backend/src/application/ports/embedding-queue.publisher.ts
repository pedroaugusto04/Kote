/**
 * Embedding queue job types and publisher port.
 *
 * Use cases publish embedding jobs after note mutations.
 * A dedicated worker consumes these jobs asynchronously.
 */

export enum EmbeddingJobType {
  Index = 'index',
  Delete = 'delete',
  ReindexAll = 'reindex-all',
}

export type EmbeddingJobPayload =
  | { type: EmbeddingJobType.Index; userId: string; noteId: string }
  | { type: EmbeddingJobType.Delete; userId: string; noteId: string }
  | { type: EmbeddingJobType.ReindexAll; userId: string };

export abstract class EmbeddingQueuePublisher {
  abstract publish(job: EmbeddingJobPayload): Promise<void>;
}

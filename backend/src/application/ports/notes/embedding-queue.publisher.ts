/**
 * Embedding queue job types and publisher port.
 *
 * Use cases publish embedding jobs after note mutations.
 * A dedicated worker consumes these jobs asynchronously.
 */

import { EmbeddingPriority } from '../../../domain/enums/knowledge.enums.js';

export enum EmbeddingJobType {
  Index = 'index',
  Delete = 'delete',
  ReindexAll = 'reindex-all',
  QueryEmbedding = 'query-embedding',
}

export type EmbeddingJobPayload =
  | { type: EmbeddingJobType.Index; userId: string; noteId: string; priority: EmbeddingPriority }
  | { type: EmbeddingJobType.Delete; userId: string; noteId: string; priority: EmbeddingPriority }
  | { type: EmbeddingJobType.ReindexAll; userId: string; priority: EmbeddingPriority }
  | { type: EmbeddingJobType.QueryEmbedding; userId: string; queryText: string; priority: EmbeddingPriority; correlationId?: string; replyTo?: string };

export abstract class EmbeddingQueuePublisher {
  abstract publish(job: EmbeddingJobPayload): Promise<void>;
  abstract publishQueryEmbedding(config: { userId: string; queryText: string }): Promise<number[][]>;
}

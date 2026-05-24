import { Injectable } from '@nestjs/common';

import {
  NoteEmbeddingRepository,
  type FindSimilarOptions,
  type NoteEmbeddingRecord,
  type SimilarChunk,
} from '../../application/ports/notes/note-embedding.repository.js';
import { PostgresDatabase } from '../persistence/database.js';

function embeddingFromRow(row: Record<string, unknown>): NoteEmbeddingRecord {
  return {
    id: String(row.id || ''),
    userId: String(row.user_id || ''),
    noteId: String(row.note_id || ''),
    chunkIndex: Number(row.chunk_index || 0),
    chunkText: String(row.chunk_text || ''),
    embedding: parseEmbeddingColumn(row.embedding),
    model: String(row.model || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

function parseEmbeddingColumn(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    const trimmed = value.replace(/^\[/, '').replace(/\]$/, '');
    return trimmed ? trimmed.split(',').map(Number) : [];
  }
  return [];
}

function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

@Injectable()
export class PostgresNoteEmbeddingRepository extends NoteEmbeddingRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async upsertChunks(
    userId: string,
    noteId: string,
    chunks: Array<Omit<NoteEmbeddingRecord, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void> {
    if (!chunks.length) return;

    const pool = this.database.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Remove stale chunks that exceed the new chunk count
      await client.query(
        `DELETE FROM kb_note_embeddings
         WHERE user_id = $1 AND note_id = $2 AND chunk_index >= $3`,
        [userId, noteId, chunks.length],
      );

      for (const chunk of chunks) {
        await client.query(
          `INSERT INTO kb_note_embeddings (user_id, note_id, chunk_index, chunk_text, embedding, model)
           VALUES ($1, $2, $3, $4, $5::vector, $6)
           ON CONFLICT (note_id, chunk_index)
           DO UPDATE SET
             chunk_text = EXCLUDED.chunk_text,
             embedding = EXCLUDED.embedding,
             model = EXCLUDED.model,
             updated_at = now()`,
          [
            userId,
            noteId,
            chunk.chunkIndex,
            chunk.chunkText,
            formatEmbeddingForPg(chunk.embedding),
            chunk.model,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteByNoteId(userId: string, noteId: string): Promise<void> {
    await this.database.getPool().query(
      'DELETE FROM kb_note_embeddings WHERE user_id = $1 AND note_id = $2',
      [userId, noteId],
    );
  }

  async findSimilar(
    userId: string,
    queryEmbedding: number[],
    options: FindSimilarOptions,
  ): Promise<SimilarChunk[]> {
    const minSimilarity = options.minSimilarity ?? 0.3;
    const workspaceFilter = String(options.workspaceSlug || '').trim();
    const projectFilter = String(options.projectSlug || '').trim();
    const optionalClauses: string[] = [];
    const values: unknown[] = [
      userId,
      formatEmbeddingForPg(queryEmbedding),
      minSimilarity,
      options.limit,
    ];
    if (workspaceFilter) {
      values.push(workspaceFilter);
      optionalClauses.push(`AND n.workspace_slug = $${values.length}`);
    }
    if (projectFilter) {
      values.push(projectFilter);
      optionalClauses.push(`AND n.project_slug = $${values.length}`);
    }

    const result = await this.database.getPool().query(
      `SELECT e.*,
              1 - (e.embedding <=> $2::vector) AS similarity
       FROM kb_note_embeddings e
       JOIN kb_notes n ON n.id = e.note_id AND n.user_id = e.user_id
       WHERE e.user_id = $1
         AND 1 - (e.embedding <=> $2::vector) >= $3
         ${optionalClauses.join('\n         ')}
       ORDER BY e.embedding <=> $2::vector
       LIMIT $4`,
      values,
    );

    return result.rows.map((row) => ({
      ...embeddingFromRow(row),
      similarity: Number(row.similarity || 0),
    }));
  }
}

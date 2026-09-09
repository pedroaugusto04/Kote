import { Injectable } from '@nestjs/common';

import {
  NoteEmbeddingRepository,
  type FindSimilarOptions,
  type NoteEmbeddingRecord,
  type SimilarChunk,
} from '../../application/ports/notes/note-embedding.repository.js';
import { PostgresDatabase } from '../persistence/database.js';
import { SPECIAL_PROJECT_SLUGS } from '../../domain/projects.js';

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
    representation: (String(row.representation || 'raw') as 'raw' | 'synthesis'),
    sourceRefs: Array.isArray(row.source_refs) ? row.source_refs.map(Number) : [],
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
      const representation = chunks[0].representation || 'raw';
      await client.query(
        `DELETE FROM kb_note_embeddings
         WHERE user_id = $1 AND note_id = $2 AND representation = $3 AND chunk_index >= $4`,
        [userId, noteId, representation, chunks.length],
      );

      const values: unknown[] = [];
      const valueRows: string[] = [];

      chunks.forEach((chunk, i) => {
        const offset = i * 8;
        valueRows.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}::vector, $${offset + 6}, $${offset + 7}, $${offset + 8}::jsonb)`,
        );
        values.push(
          userId,
          noteId,
          chunk.chunkIndex,
          chunk.chunkText,
          formatEmbeddingForPg(chunk.embedding),
          chunk.model,
          chunk.representation || 'raw',
          JSON.stringify(chunk.sourceRefs || []),
        );
      });

      await client.query(
        `INSERT INTO kb_note_embeddings (user_id, note_id, chunk_index, chunk_text, embedding, model, representation, source_refs)
         VALUES ${valueRows.join(', ')}
        ON CONFLICT (note_id, representation, chunk_index)
         DO UPDATE SET
           chunk_text = EXCLUDED.chunk_text,
           embedding = EXCLUDED.embedding,
           model = EXCLUDED.model,
           representation = EXCLUDED.representation,
           source_refs = EXCLUDED.source_refs,
           updated_at = now()`,
        values,
      );

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

  async deleteByNoteIdAndRepresentation(userId: string, noteId: string, representation: 'raw' | 'synthesis'): Promise<void> {
    await this.database.getPool().query(
      'DELETE FROM kb_note_embeddings WHERE user_id = $1 AND note_id = $2 AND representation = $3',
      [userId, noteId, representation],
    );
  }

  async findSimilar(
    userId: string,
    queryEmbedding: number[],
    options: FindSimilarOptions,
  ): Promise<SimilarChunk[]> {
    const minSimilarity = options.minSimilarity ?? 0.3;
    const workspaceId = String(options.workspaceId || '').trim();
    const projectId = String(options.projectId || '').trim();

    const values: unknown[] = [
      userId,
      formatEmbeddingForPg(queryEmbedding),
      minSimilarity,
      options.limit,
    ];

    const optionalClauses: string[] = [];
    if (workspaceId) {
      values.push(workspaceId);
      optionalClauses.push(`AND n.workspace_id = $${values.length}`);
    }
    if (projectId) {
      values.push(projectId);
      optionalClauses.push(`AND (n.project_id = $${values.length} OR p.project_slug = '${SPECIAL_PROJECT_SLUGS.INBOX}' OR n.project_id IS NULL)`);
    }
    if (options.representation && options.representation !== 'all') {
      values.push(options.representation);
      optionalClauses.push(`AND e.representation = $${values.length}`);
    }

    const result = await this.database.getPool().query(
      `SELECT e.*,
              (1 - (e.embedding <=> $2::vector)) + CASE WHEN e.representation = 'synthesis' THEN 0.035 ELSE 0 END AS similarity
       FROM kb_note_embeddings e
       JOIN kb_notes n ON n.id = e.note_id AND n.user_id = e.user_id
       LEFT JOIN kb_projects p ON p.id = n.project_id
       WHERE e.user_id = $1
         AND 1 - (e.embedding <=> $2::vector) >= $3
         ${optionalClauses.join('\n         ')}
       ORDER BY similarity DESC
       LIMIT $4`,
      values,
    );

    return result.rows.map((row) => ({
      ...embeddingFromRow(row),
      similarity: Number(row.similarity || 0),
    }));
  }

  async getNoteEmbeddings(userId: string, noteId: string): Promise<NoteEmbeddingRecord[]> {
    const result = await this.database.getPool().query(
      `SELECT * FROM kb_note_embeddings
       WHERE user_id = $1 AND note_id = $2
       ORDER BY chunk_index ASC`,
      [userId, noteId],
    );
    return result.rows.map(embeddingFromRow);
  }

  async getNotesEmbeddings(userId: string, noteIds: string[]): Promise<NoteEmbeddingRecord[]> {
    if (noteIds.length === 0) return [];

    const result = await this.database.getPool().query(
      `SELECT * FROM kb_note_embeddings
       WHERE user_id = $1 AND note_id = ANY($2)
       ORDER BY note_id, chunk_index ASC`,
      [userId, noteIds],
    );
    return result.rows.map(embeddingFromRow);
  }
}

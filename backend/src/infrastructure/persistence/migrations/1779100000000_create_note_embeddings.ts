import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Creates the kb_note_embeddings table for storing vector embeddings of note chunks.
 *
 * Requires the pgvector extension to be installed on the Postgres server.
 * In environments where pgvector is not available (e.g. CI with plain postgres:16),
 * the migration gracefully skips all vector-related DDL via a PL/pgSQL guard so
 * that the remaining migration chain is not blocked.
 */
export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
        RAISE NOTICE 'pgvector extension not available — skipping kb_note_embeddings';
        RETURN;
      END IF;

      BEGIN
        CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create extension vector';
      END;

      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector' AND pg_type_is_visible(oid)) THEN
        RAISE NOTICE 'vector type is not available — skipping kb_note_embeddings';
        RETURN;
      END IF;
      
      EXECUTE 'CREATE TABLE IF NOT EXISTS kb_note_embeddings (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid NOT NULL REFERENCES kb_users(id) ON DELETE CASCADE,
        note_id       uuid NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
        chunk_index   int NOT NULL DEFAULT 0,
        chunk_text    text NOT NULL,
        embedding     vector(768) NOT NULL,
        model         varchar(100) NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        UNIQUE (note_id, chunk_index)
      )';

      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_note_embeddings_user
        ON kb_note_embeddings(user_id)';

      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_note_embeddings_note
        ON kb_note_embeddings(note_id)';

      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_note_embeddings_vector
        ON kb_note_embeddings USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)';
    END
    $$;
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql('DROP TABLE IF EXISTS kb_note_embeddings;');
}

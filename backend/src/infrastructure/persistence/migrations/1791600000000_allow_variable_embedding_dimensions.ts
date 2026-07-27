import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    DO $$
    BEGIN
      -- Check if kb_note_embeddings table exists and is visible
      IF to_regclass('kb_note_embeddings') IS NOT NULL THEN
        -- Drop the HNSW vector index since it requires a fixed dimension
        EXECUTE 'DROP INDEX IF EXISTS idx_note_embeddings_vector';

        -- Alter vector column to omit dimension constraint
        EXECUTE 'ALTER TABLE kb_note_embeddings ALTER COLUMN embedding TYPE vector';
      END IF;
    END
    $$;
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql(`
    DO $$
    BEGIN
      -- Check if kb_note_embeddings table exists and is visible
      IF to_regclass('kb_note_embeddings') IS NOT NULL THEN
        -- Restore the dimension constraint to 768
        EXECUTE 'ALTER TABLE kb_note_embeddings ALTER COLUMN embedding TYPE vector(768)';

        -- Recreate the HNSW vector index
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_note_embeddings_vector
          ON kb_note_embeddings USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)';
      END IF;
    END
    $$;
  `);
}

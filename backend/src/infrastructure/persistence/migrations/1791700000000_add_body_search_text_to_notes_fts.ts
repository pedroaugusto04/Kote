import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_notes ADD COLUMN IF NOT EXISTS body_search_text text NOT NULL DEFAULT '';

    -- Update in batches to avoid timeout/memory issues
    DO $$
    DECLARE
      batch_size INT := 1000;
      updated_count INT;
    BEGIN
      LOOP
        UPDATE kb_notes
        SET body_search_text = LEFT(
          TRIM(COALESCE(NULLIF(metadata->>'rawText', ''), summary, '')),
          100000
        )
        WHERE body_search_text = ''
        LIMIT batch_size;
        
        GET DIAGNOSTICS updated_count = ROW_COUNT;
        EXIT WHEN updated_count = 0;
        COMMIT;
      END LOOP;
    END $$;

    DROP INDEX IF EXISTS idx_notes_search_vector;

    ALTER TABLE kb_notes DROP COLUMN IF EXISTS search_vector;

    ALTER TABLE kb_notes ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(title, '')) ||
      to_tsvector('portuguese', coalesce(title, '')) ||
      to_tsvector('english', coalesce(summary, '')) ||
      to_tsvector('portuguese', coalesce(summary, '')) ||
      to_tsvector('english', coalesce(path, '')) ||
      to_tsvector('portuguese', coalesce(path, '')) ||
      to_tsvector('english', coalesce(cast(tags as text), '')) ||
      to_tsvector('portuguese', coalesce(cast(tags as text), '')) ||
      to_tsvector('english', coalesce(body_search_text, '')) ||
      to_tsvector('portuguese', coalesce(body_search_text, ''))
    ) STORED;

    CREATE INDEX IF NOT EXISTS idx_notes_search_vector ON kb_notes USING gin(search_vector);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_notes_search_vector;

    ALTER TABLE kb_notes DROP COLUMN IF EXISTS search_vector;

    ALTER TABLE kb_notes ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
      to_tsvector('english', title) ||
      to_tsvector('portuguese', title) ||
      to_tsvector('english', summary) ||
      to_tsvector('portuguese', summary) ||
      to_tsvector('english', path) ||
      to_tsvector('portuguese', path) ||
      to_tsvector('english', cast(tags as text)) ||
      to_tsvector('portuguese', cast(tags as text))
    ) STORED;

    CREATE INDEX IF NOT EXISTS idx_notes_search_vector ON kb_notes USING gin(search_vector);

    ALTER TABLE kb_notes DROP COLUMN IF EXISTS body_search_text;
  `);
}

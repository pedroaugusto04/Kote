import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_notes ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
      to_tsvector('english', title) ||
      to_tsvector('english', summary) ||
      to_tsvector('english', path) ||
      to_tsvector('english', cast(tags as text))
    ) STORED;
    
    DROP INDEX IF EXISTS idx_notes_fts;
    
    CREATE INDEX IF NOT EXISTS idx_notes_search_vector ON kb_notes USING gin(search_vector);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_notes_search_vector;
    
    ALTER TABLE kb_notes DROP COLUMN IF EXISTS search_vector;
    
    CREATE INDEX IF NOT EXISTS idx_notes_fts ON kb_notes USING gin(
      (
        to_tsvector('english', title) ||
        to_tsvector('english', summary) ||
        to_tsvector('english', path) ||
        to_tsvector('english', cast(tags as text))
      )
    );
  `);
}

import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
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

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_notes_fts;
  `);
}

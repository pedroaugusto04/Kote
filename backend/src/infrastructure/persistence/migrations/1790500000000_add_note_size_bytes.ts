import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_notes 
    ADD COLUMN IF NOT EXISTS size_bytes BIGINT NOT NULL DEFAULT 0;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_notes 
    DROP COLUMN IF EXISTS size_bytes;
  `);
}

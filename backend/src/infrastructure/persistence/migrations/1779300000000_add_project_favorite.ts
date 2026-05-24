import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    ALTER TABLE kb_projects
    ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql(`ALTER TABLE kb_projects DROP COLUMN IF EXISTS is_favorite`);
}

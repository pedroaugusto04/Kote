import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Index on project_id speeds up correlated subqueries, joins, and foreign key cascades on kb_notes
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS kb_notes_project_id_idx ON kb_notes (project_id);
    CREATE INDEX IF NOT EXISTS kb_notes_user_project_id_idx ON kb_notes (user_id, project_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS kb_notes_user_project_id_idx;
    DROP INDEX IF EXISTS kb_notes_project_id_idx;
  `);
}

import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add default value to id column for auto-generation
  pgm.sql('ALTER TABLE kb_project_brief_history ALTER COLUMN id SET DEFAULT gen_random_uuid();');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Remove the default value
  pgm.sql('ALTER TABLE kb_project_brief_history ALTER COLUMN id DROP DEFAULT;');
}

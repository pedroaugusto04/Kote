import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE kb_plans 
    SET max_workspaces = 2 
    WHERE slug = 'free';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE kb_plans 
    SET max_workspaces = 1 
    WHERE slug = 'free';
  `);
}

import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_users
    ADD COLUMN IF NOT EXISTS vscode_installed_at TIMESTAMPTZ DEFAULT NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_users
    DROP COLUMN IF EXISTS vscode_installed_at;
  `);
}

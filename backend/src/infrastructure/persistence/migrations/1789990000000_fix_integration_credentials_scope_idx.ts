import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Ensure any legacy index is removed and create a unique index on the new workspace_id column
  pgm.sql('DROP INDEX IF EXISTS kb_integration_credentials_scope_idx;');
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS kb_integration_credentials_scope_idx
    ON kb_integration_credentials (user_id, workspace_id, provider);`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS kb_integration_credentials_scope_idx;');
}

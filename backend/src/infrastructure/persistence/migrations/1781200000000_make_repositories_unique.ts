import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Re-create the dropped index as a UNIQUE constraint/index on (workspace_id, external_id)
  pgm.createIndex('kb_repositories', ['workspace_id', 'external_id'], {
    unique: true,
    name: 'kb_repositories_workspace_id_external_id_idx',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('kb_repositories', ['workspace_id', 'external_id'], {
    name: 'kb_repositories_workspace_id_external_id_idx',
  });
}

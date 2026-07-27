import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.addConstraint('kb_workspaces', 'kb_workspaces_user_slug_unique', {
    unique: ['user_id', 'workspace_slug'],
  });
}

export async function down(pgm: MigrationBuilder) {
  pgm.dropConstraint('kb_workspaces', 'kb_workspaces_user_slug_unique');
}

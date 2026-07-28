import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('kb_workspaces', {
    dependencyWatcherEnabled: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('kb_workspaces', 'dependencyWatcherEnabled');
}

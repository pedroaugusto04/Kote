import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.createTable('kb_dependency_monitored_repositories', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'kb_users(id)',
      onDelete: 'CASCADE',
    },
    workspace_id: {
      type: 'uuid',
      notNull: true,
      references: 'kb_workspaces(id)',
      onDelete: 'CASCADE',
    },
    repository_id: {
      type: 'uuid',
      notNull: true,
      references: 'kb_repositories(id)',
      onDelete: 'CASCADE',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('kb_dependency_monitored_repositories', ['user_id', 'workspace_id'], {
    name: 'kb_dependency_monitored_repositories_workspace_idx',
  });

  pgm.createIndex('kb_dependency_monitored_repositories', ['user_id', 'workspace_id', 'repository_id'], {
    name: 'kb_dependency_monitored_repositories_unique_idx',
    unique: true,
  });
}

export async function down(pgm: MigrationBuilder) {
  pgm.dropTable('kb_dependency_monitored_repositories');
}

import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.createTable('kb_project_map_clusters', {
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
    project_id: {
      type: 'uuid',
      notNull: true,
      references: 'kb_projects(id)',
      onDelete: 'CASCADE',
    },
    clusters_payload: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('kb_project_map_clusters', ['user_id', 'workspace_id', 'project_id'], {
    name: 'kb_project_map_clusters_user_workspace_project_idx',
    unique: true,
  });
}

export async function down(pgm: MigrationBuilder) {
  pgm.dropTable('kb_project_map_clusters');
}

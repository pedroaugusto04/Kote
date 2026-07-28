import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.createTable('kb_dependency_watch', {
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
    ecosystem: {
      type: 'text',
      notNull: true,
    },
    package_name: {
      type: 'text',
      notNull: true,
    },
    current_version: {
      type: 'text',
      notNull: true,
    },
    latest_seen_version: {
      type: 'text',
      notNull: true,
      default: '',
    },
    check_interval_hours: {
      type: 'integer',
      notNull: true,
      default: 24,
    },
    last_checked_at: {
      type: 'timestamp with time zone',
    },
    last_alerted_at: {
      type: 'timestamp with time zone',
    },
    enabled: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    repository_id: {
      type: 'uuid',
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

  pgm.createIndex('kb_dependency_watch', ['user_id', 'workspace_id'], {
    name: 'kb_dependency_watch_user_workspace_idx',
  });

  pgm.createIndex('kb_dependency_watch', ['user_id', 'workspace_id', 'ecosystem', 'package_name'], {
    name: 'kb_dependency_watch_ecosystem_package_idx',
    unique: true,
  });

  pgm.createIndex('kb_dependency_watch', ['last_checked_at'], {
    name: 'kb_dependency_watch_last_checked_idx',
  });
}

export async function down(pgm: MigrationBuilder) {
  pgm.dropTable('kb_dependency_watch');
}

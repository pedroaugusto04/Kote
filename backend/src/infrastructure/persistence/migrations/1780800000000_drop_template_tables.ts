import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('kb_note_templates');
  pgm.dropTable('kb_project_templates');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('kb_note_templates', {
    id: { type: 'uuid', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'kb_users(id)', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    content: { type: 'text', notNull: true },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: 'now()' },
    updated_at: { type: 'timestamptz', notNull: true, default: 'now()' },
  });

  pgm.createTable('kb_project_templates', {
    id: { type: 'uuid', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'kb_users(id)', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    config: { type: 'jsonb', notNull: true, default: '{}' },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: 'now()' },
    updated_at: { type: 'timestamptz', notNull: true, default: 'now()' },
  });
}

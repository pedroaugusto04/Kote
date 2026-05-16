import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('kb_project_aliases');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('kb_project_aliases', {
    project_id: { type: 'uuid', notNull: true, references: 'kb_projects(id)', onDelete: 'CASCADE' },
    alias: { type: 'text', notNull: true },
  });
  pgm.addConstraint('kb_project_aliases', 'kb_project_aliases_pk', { primaryKey: ['project_id', 'alias'] });
}

import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.addConstraint('kb_projects', 'kb_projects_user_slug_unique', {
    unique: ['user_id', 'project_slug'],
  });
}

export async function down(pgm: MigrationBuilder) {
  pgm.dropConstraint('kb_projects', 'kb_projects_user_slug_unique');
}

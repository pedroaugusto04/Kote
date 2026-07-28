import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('dependency_ecosystem', ['npm', 'pip', 'composer', 'cargo', 'maven', 'gradle', 'go', 'nuget', 'rubygems']);
  
  pgm.alterColumn('kb_dependency_watch', 'ecosystem', {
    type: 'dependency_ecosystem',
    notNull: true,
    using: 'ecosystem::dependency_ecosystem',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.alterColumn('kb_dependency_watch', 'ecosystem', {
    type: 'text',
    notNull: true,
    using: 'ecosystem::text',
  });
  
  pgm.dropType('dependency_ecosystem');
}

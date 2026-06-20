import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    alter table kb_project_brief_history 
    add column if not exists workspace_slug text not null default '',
    add column if not exists project_slug text not null default '';

    alter table kb_project_brief_history 
    alter column project_id drop not null;

    create index if not exists idx_project_brief_history_user_workspace_project
      on kb_project_brief_history (user_id, workspace_slug, project_slug);
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql(`
    drop index if exists idx_project_brief_history_user_workspace_project;
    
    alter table kb_project_brief_history 
    alter column project_id set not null;

    alter table kb_project_brief_history 
    drop column if exists project_slug,
    drop column if exists workspace_slug;
  `);
}

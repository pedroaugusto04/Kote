import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    create table if not exists kb_project_files (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references kb_projects(id) on delete cascade,
      file_path text not null,
      updated_at timestamptz not null default now(),
      constraint uq_kb_project_files_proj_path unique (project_id, file_path)
    );

    create index if not exists kb_project_files_proj_idx
      on kb_project_files (project_id);
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql('drop table if exists kb_project_files;');
}

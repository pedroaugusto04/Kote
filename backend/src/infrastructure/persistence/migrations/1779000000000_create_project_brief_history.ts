import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    create table if not exists kb_project_brief_history (
      id uuid primary key,
      user_id uuid not null references kb_users(id) on delete cascade,
      workspace_slug text not null,
      project_slug text not null,
      brief jsonb not null,
      source_refs jsonb not null default '[]'::jsonb,
      context_hash text not null default '',
      context_window integer not null default 30,
      provider text not null default '',
      model text not null default '',
      generated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );

    create index if not exists kb_project_brief_history_lookup_idx
      on kb_project_brief_history (user_id, workspace_slug, project_slug, generated_at desc);
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql('drop table if exists kb_project_brief_history;');
}

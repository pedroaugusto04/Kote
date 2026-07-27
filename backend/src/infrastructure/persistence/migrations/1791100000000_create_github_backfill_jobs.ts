import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    create table if not exists kb_github_backfill_jobs (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references kb_users(id) on delete cascade,
      workspace_slug text not null,
      repositories jsonb not null default '[]'::jsonb,
      status text not null default 'queued'
        check (status in ('queued', 'running', 'completed', 'failed', 'quota_exceeded')),
      total integer not null default 0,
      processed integer not null default 0,
      imported integer not null default 0,
      skipped integer not null default 0,
      "limit" integer not null default 5,
      error text,
      started_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      completed_at timestamptz
    );

    create index if not exists kb_github_backfill_jobs_user_id_idx
      on kb_github_backfill_jobs (user_id, id);

    create index if not exists kb_github_backfill_jobs_status_idx
      on kb_github_backfill_jobs (status)
      where status in ('queued', 'running');
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql('drop table if exists kb_github_backfill_jobs;');
}

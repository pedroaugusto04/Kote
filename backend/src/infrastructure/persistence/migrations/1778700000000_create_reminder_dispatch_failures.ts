import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    create table if not exists kb_reminder_dispatch_failures (
      user_id uuid not null references kb_users(id) on delete cascade,
      workspace_slug text not null,
      mode text not null,
      dispatch_key text not null,
      reminder_id uuid not null,
      channel text not null,
      attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 5),
      next_retry_at timestamptz,
      last_error text not null default '',
      updated_at timestamptz not null default now(),
      primary key (user_id, workspace_slug, mode, dispatch_key, reminder_id, channel)
    );

    create index if not exists kb_reminder_dispatch_failures_retry_idx
      on kb_reminder_dispatch_failures (next_retry_at)
      where next_retry_at is not null;
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql(`
    drop table if exists kb_reminder_dispatch_failures;
  `);
}

import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    alter table kb_users alter column password_hash drop not null;

    create table if not exists kb_auth_identities (
      id uuid primary key,
      provider text not null,
      provider_user_id text not null,
      user_id uuid not null references kb_users(id) on delete cascade,
      email text not null,
      email_verified boolean not null default false,
      display_name text not null default '',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create unique index if not exists kb_auth_identities_provider_user_idx
      on kb_auth_identities (provider, provider_user_id);
    create unique index if not exists kb_auth_identities_user_provider_idx
      on kb_auth_identities (user_id, provider);
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql(`
    drop table if exists kb_auth_identities;
    update kb_users set password_hash = '' where password_hash is null;
    alter table kb_users alter column password_hash set not null;
  `);
}

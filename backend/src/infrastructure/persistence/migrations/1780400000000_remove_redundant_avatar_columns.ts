import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    alter table kb_users
      drop column if exists avatar_storage_key,
      drop column if exists avatar_mime_type,
      drop column if exists avatar_size_bytes,
      drop column if exists avatar_updated_at;
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql(`
    alter table kb_users
      add column if not exists avatar_storage_key text,
      add column if not exists avatar_mime_type text,
      add column if not exists avatar_size_bytes integer,
      add column if not exists avatar_updated_at timestamptz;
  `);
}

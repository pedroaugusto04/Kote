import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS kb_push_subscriptions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES kb_users(id) ON DELETE CASCADE,
      endpoint        TEXT NOT NULL UNIQUE,
      p256dh          TEXT NOT NULL,
      auth            TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_push_subs_user ON kb_push_subscriptions(user_id);
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql(`DROP TABLE IF EXISTS kb_push_subscriptions`);
}

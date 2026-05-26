import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS kb_webhook_subscriptions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES kb_users(id) ON DELETE CASCADE,
      workspace_slug  TEXT NOT NULL,
      label           TEXT NOT NULL DEFAULT '',
      url             TEXT NOT NULL,
      secret          TEXT,
      events          TEXT[] NOT NULL DEFAULT '{}',
      enabled         BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_subs_user
      ON kb_webhook_subscriptions(user_id);

    CREATE INDEX IF NOT EXISTS idx_webhook_subs_events
      ON kb_webhook_subscriptions USING GIN(events);
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql(`DROP TABLE IF EXISTS kb_webhook_subscriptions`);
}

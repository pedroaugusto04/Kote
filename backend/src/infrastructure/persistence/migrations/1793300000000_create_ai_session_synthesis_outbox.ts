import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS kb_ai_session_synthesis_outbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id uuid NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES kb_users(id) ON DELETE CASCADE,
      workspace_slug varchar(255) NOT NULL,
      source_hash varchar(128) NOT NULL,
      job_type varchar(64) NOT NULL DEFAULT 'ai_session_synthesis' CHECK (job_type = 'ai_session_synthesis'),
      status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','processing','completed','failed','skipped','superseded')),
      attempts integer NOT NULL DEFAULT 0,
      available_at timestamptz NOT NULL DEFAULT now(),
      lease_until timestamptz,
      published_at timestamptz,
      charged_at timestamptz,
      error_code varchar(120),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (note_id, source_hash, job_type)
    );
    CREATE INDEX IF NOT EXISTS kb_ai_session_synthesis_outbox_ready_idx
      ON kb_ai_session_synthesis_outbox(status, available_at);
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql('DROP TABLE IF EXISTS kb_ai_session_synthesis_outbox;');
}

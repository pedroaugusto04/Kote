import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder) {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS kb_note_syntheses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES kb_users(id) ON DELETE CASCADE,
      note_id uuid NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
      status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','skipped')),
      mode varchar(20) NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai','deterministic')),
      overview text NOT NULL DEFAULT '',
      memory jsonb NOT NULL DEFAULT '[]'::jsonb,
      source_hash varchar(128) NOT NULL,
      provider varchar(100) NOT NULL DEFAULT '',
      model varchar(200) NOT NULL DEFAULT '',
      error_code varchar(120),
      generated_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (note_id)
    );
    CREATE INDEX IF NOT EXISTS kb_note_syntheses_user_status_idx ON kb_note_syntheses(user_id, status);
  `);
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kb_note_embeddings' AND column_name = 'chunk_index') THEN
        ALTER TABLE kb_note_embeddings ADD COLUMN IF NOT EXISTS representation varchar(20) NOT NULL DEFAULT 'raw';
        ALTER TABLE kb_note_embeddings ADD COLUMN IF NOT EXISTS source_refs jsonb NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE kb_note_embeddings DROP CONSTRAINT IF EXISTS kb_note_embeddings_note_id_chunk_index_key;
        CREATE UNIQUE INDEX IF NOT EXISTS kb_note_embeddings_note_rep_chunk_uidx ON kb_note_embeddings(note_id, representation, chunk_index);
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder) {
  pgm.sql('DROP TABLE IF EXISTS kb_note_syntheses;');
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'kb_note_embeddings' AND column_name = 'representation') THEN
        DROP INDEX IF EXISTS kb_note_embeddings_note_rep_chunk_uidx;
        ALTER TABLE kb_note_embeddings DROP COLUMN IF EXISTS source_refs;
        ALTER TABLE kb_note_embeddings DROP COLUMN IF EXISTS representation;
        CREATE UNIQUE INDEX IF NOT EXISTS kb_note_embeddings_note_chunk_uidx ON kb_note_embeddings(note_id, chunk_index);
      END IF;
    END $$;
  `);
}

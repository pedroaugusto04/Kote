import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    -- 1. Insert links based on the 'path' column of notes (where path is present)
    INSERT INTO kb_note_links (id, user_id, note_id, target, metadata, created_at)
    SELECT 
      gen_random_uuid(),
      user_id,
      id AS note_id,
      path AS target,
      '{"source": "legacy_path"}'::jsonb,
      created_at
    FROM kb_notes
    WHERE path IS NOT NULL AND path != ''
    ON CONFLICT (id) DO NOTHING;

    -- 2. Insert links based on the 'changedFiles' array in metadata
    INSERT INTO kb_note_links (id, user_id, note_id, target, metadata, created_at)
    SELECT 
      gen_random_uuid(),
      user_id,
      id AS note_id,
      file_path::text AS target,
      '{"source": "legacy_metadata_github"}'::jsonb,
      created_at
    FROM kb_notes,
    LATERAL jsonb_array_elements_text(COALESCE(metadata->'changedFiles', '[]'::jsonb)) AS file_path
    WHERE metadata->'changedFiles' IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DELETE FROM kb_note_links 
    WHERE metadata->>'source' IN ('legacy_path', 'legacy_metadata_github');
  `);
}

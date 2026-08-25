import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO kb_note_links (id, user_id, note_id, target, metadata, created_at)
    SELECT
    DISTINCT ON (notes.user_id, notes.id, normalized.target)
      gen_random_uuid(),
      notes.user_id,
      notes.id,
      normalized.target,
      '{"source": "metadata_changed_files_backfill"}'::jsonb,
      notes.created_at
    FROM kb_notes AS notes
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(notes.metadata->'changedFiles') = 'array'
          THEN notes.metadata->'changedFiles'
        ELSE '[]'::jsonb
      END
    ) AS changed(file_path)
    CROSS JOIN LATERAL (
      SELECT regexp_replace(
        trim(both '/' from regexp_replace(trim(changed.file_path), '\\\\', '/', 'g')),
        '^[.]/+',
        ''
      ) AS target
    ) AS normalized
    WHERE normalized.target <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM kb_note_links AS existing
        WHERE existing.user_id = notes.user_id
          AND existing.note_id = notes.id
          AND regexp_replace(
            trim(both '/' from regexp_replace(trim(existing.target), '\\\\', '/', 'g')),
            '^[.]/+',
            ''
          ) = normalized.target
      );

    CREATE INDEX IF NOT EXISTS kb_note_links_user_target_idx
      ON kb_note_links (user_id, target);

    -- Manual/IDE notes retain their full source in rawText. Repair only rows
    -- whose indexed body differs, in bounded batches to reduce lock pressure.
    DO $$
    DECLARE
      batch_size INT := 1000;
      updated_count INT;
    BEGIN
      LOOP
        WITH batch AS (
          SELECT
            ctid,
            LEFT(metadata->>'rawText', 100000) AS repaired_body_search_text
          FROM kb_notes
          WHERE coalesce(metadata->>'rawText', '') <> ''
            AND body_search_text IS DISTINCT FROM LEFT(metadata->>'rawText', 100000)
          LIMIT batch_size
        )
        UPDATE kb_notes AS notes
        SET body_search_text = batch.repaired_body_search_text
        FROM batch
        WHERE notes.ctid = batch.ctid;

        GET DIAGNOSTICS updated_count = ROW_COUNT;
        EXIT WHEN updated_count = 0;
      END LOOP;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS kb_note_links_user_target_idx;

    DELETE FROM kb_note_links
    WHERE metadata->>'source' = 'metadata_changed_files_backfill';
  `);
}

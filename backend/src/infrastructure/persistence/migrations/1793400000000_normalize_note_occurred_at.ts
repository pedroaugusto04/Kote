import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Older installations restored kb_notes.occurred_at as text. The application
 * model and current schema both treat it as a timestamp, so normalize the
 * column while preserving usable legacy values.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION pg_temp.kb_safe_occurred_at(value text, fallback timestamptz)
    RETURNS timestamptz
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN COALESCE(NULLIF(BTRIM(value), '')::timestamptz, fallback);
    EXCEPTION WHEN others THEN
      RETURN fallback;
    END;
    $$;

    DO $$
    DECLARE
      occurred_at_type text;
    BEGIN
      SELECT data_type
        INTO occurred_at_type
        FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'kb_notes'
         AND column_name = 'occurred_at';

      IF occurred_at_type = 'text' THEN
        -- PostgreSQL does not automatically cast a legacy text default when
        -- changing the column type, so remove it before the conversion.
        ALTER TABLE kb_notes
          ALTER COLUMN occurred_at DROP DEFAULT;

        ALTER TABLE kb_notes
          ALTER COLUMN occurred_at TYPE timestamptz
          USING pg_temp.kb_safe_occurred_at(occurred_at, created_at);
      END IF;

      UPDATE kb_notes
         SET occurred_at = created_at
       WHERE occurred_at IS NULL;

      ALTER TABLE kb_notes
        ALTER COLUMN occurred_at SET DEFAULT now(),
        ALTER COLUMN occurred_at SET NOT NULL;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$
    DECLARE
      occurred_at_type text;
    BEGIN
      SELECT data_type
        INTO occurred_at_type
        FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'kb_notes'
         AND column_name = 'occurred_at';

      IF occurred_at_type = 'timestamp with time zone' THEN
        ALTER TABLE kb_notes
          ALTER COLUMN occurred_at DROP NOT NULL,
          ALTER COLUMN occurred_at DROP DEFAULT,
          ALTER COLUMN occurred_at TYPE text
          USING occurred_at::text;
      END IF;
    END $$;
  `);
}

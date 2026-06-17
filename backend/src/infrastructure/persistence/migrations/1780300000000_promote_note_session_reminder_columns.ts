import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add dedicated columns
  pgm.sql(`
    ALTER TABLE kb_notes
      ADD COLUMN IF NOT EXISTS session_id   text not null default '',
      ADD COLUMN IF NOT EXISTS reminder_date text not null default '',
      ADD COLUMN IF NOT EXISTS reminder_at   text not null default '';
  `);

  // Backfill from existing metadata JSONB values
  pgm.sql(`
    UPDATE kb_notes
    SET
      session_id   = coalesce(metadata->>'sessionId',   ''),
      reminder_date = coalesce(metadata->>'reminderDate', ''),
      reminder_at   = coalesce(metadata->>'reminderAt',   '')
    WHERE
      metadata->>'sessionId'   is not null
      OR metadata->>'reminderDate' is not null
      OR metadata->>'reminderAt'   is not null;
  `);

  // Index for deduplication lookup: source + session_id per user
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS kb_notes_user_source_session_idx
      ON kb_notes (user_id, source, session_id)
      WHERE session_id <> '';
  `);

  // Index to speed up reminder-based filters
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS kb_notes_reminder_at_idx
      ON kb_notes (reminder_at)
      WHERE reminder_at <> '';
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS kb_notes_reminder_date_idx
      ON kb_notes (reminder_date)
      WHERE reminder_date <> '';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS kb_notes_reminder_date_idx;`);
  pgm.sql(`DROP INDEX IF EXISTS kb_notes_reminder_at_idx;`);
  pgm.sql(`DROP INDEX IF EXISTS kb_notes_user_source_session_idx;`);

  pgm.sql(`
    ALTER TABLE kb_notes
      DROP COLUMN IF EXISTS session_id,
      DROP COLUMN IF EXISTS reminder_date,
      DROP COLUMN IF EXISTS reminder_at;
  `);
}

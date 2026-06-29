import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Drop the index on reminder_date if it exists (idempotent)
  pgm.sql(`DROP INDEX IF EXISTS kb_notes_reminder_date_idx;`);

  // Drop the reminder_date column (legacy data not needed)
  pgm.dropColumn('kb_notes', 'reminder_date');

  // Drop the old reminder_at column (text type with legacy data)
  pgm.dropColumn('kb_notes', 'reminder_at');

  // Re-add reminder_at as timestamptz type
  pgm.sql(`
    ALTER TABLE kb_notes
    ADD COLUMN reminder_at timestamptz;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Change reminder_at back to text
  pgm.sql(`
    ALTER TABLE kb_notes
    ALTER COLUMN reminder_at TYPE TEXT;
  `);

  // Re-add reminder_date column as text
  pgm.sql(`
    ALTER TABLE kb_notes
    ADD COLUMN reminder_date TEXT NOT NULL DEFAULT '';
  `);

  // Re-create the index on reminder_date
  pgm.sql(`
    CREATE INDEX kb_notes_reminder_date_idx ON kb_notes (reminder_date);
  `);
}

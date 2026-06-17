import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_notes
    ADD CONSTRAINT check_note_status
    CHECK (status IN ('active', 'pending', 'resolved', 'archived'));
  `);

  pgm.sql(`
    ALTER TABLE kb_notes
    ADD CONSTRAINT check_note_type
    CHECK (type IN ('event', 'decision', 'knowledge', 'incident', 'followup'));
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_notes
    DROP CONSTRAINT IF EXISTS check_note_status;
  `);

  pgm.sql(`
    ALTER TABLE kb_notes
    DROP CONSTRAINT IF EXISTS check_note_type;
  `);
}

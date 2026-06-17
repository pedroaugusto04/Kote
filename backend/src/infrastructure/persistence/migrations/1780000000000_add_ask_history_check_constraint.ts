import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_ask_history
    ADD CONSTRAINT check_confidence
    CHECK (confidence IN ('low', 'medium', 'high'));
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_ask_history
    DROP CONSTRAINT IF EXISTS check_confidence;
  `);
}

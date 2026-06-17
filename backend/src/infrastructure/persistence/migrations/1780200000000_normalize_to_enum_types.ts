import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create ENUM types
  pgm.sql(`CREATE TYPE note_status_enum AS ENUM ('active', 'pending', 'resolved', 'archived');`);
  pgm.sql(`CREATE TYPE note_type_enum AS ENUM ('event', 'decision', 'knowledge', 'incident', 'followup');`);
  pgm.sql(`CREATE TYPE ask_confidence_enum AS ENUM ('low', 'medium', 'high');`);
  pgm.sql(`CREATE TYPE credential_status_enum AS ENUM ('connected', 'revoked');`);

  // Drop old CHECK constraints
  pgm.sql(`ALTER TABLE kb_notes DROP CONSTRAINT IF EXISTS check_note_status;`);
  pgm.sql(`ALTER TABLE kb_notes DROP CONSTRAINT IF EXISTS check_note_type;`);
  pgm.sql(`ALTER TABLE kb_ask_history DROP CONSTRAINT IF EXISTS check_confidence;`);
  pgm.sql(`ALTER TABLE kb_integration_credentials DROP CONSTRAINT IF EXISTS check_credential_status;`);

  // Alter columns to use ENUM types
  pgm.sql(`ALTER TABLE kb_notes ALTER COLUMN status TYPE note_status_enum USING status::note_status_enum;`);
  pgm.sql(`ALTER TABLE kb_notes ALTER COLUMN type TYPE note_type_enum USING type::note_type_enum;`);
  pgm.sql(`ALTER TABLE kb_ask_history ALTER COLUMN confidence TYPE ask_confidence_enum USING confidence::ask_confidence_enum;`);
  pgm.sql(`ALTER TABLE kb_integration_credentials ALTER COLUMN status TYPE credential_status_enum USING status::credential_status_enum;`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Revert columns back to text
  pgm.sql(`ALTER TABLE kb_notes ALTER COLUMN status TYPE text USING status::text;`);
  pgm.sql(`ALTER TABLE kb_notes ALTER COLUMN type TYPE text USING type::text;`);
  pgm.sql(`ALTER TABLE kb_ask_history ALTER COLUMN confidence TYPE text USING confidence::text;`);
  pgm.sql(`ALTER TABLE kb_integration_credentials ALTER COLUMN status TYPE text USING status::text;`);

  // Recreate CHECK constraints
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
  pgm.sql(`
    ALTER TABLE kb_ask_history
    ADD CONSTRAINT check_confidence
    CHECK (confidence IN ('low', 'medium', 'high'));
  `);
  pgm.sql(`
    ALTER TABLE kb_integration_credentials
    ADD CONSTRAINT check_credential_status
    CHECK (status IN ('connected', 'revoked'));
  `);

  // Drop ENUM types
  pgm.sql(`DROP TYPE IF EXISTS note_status_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS note_type_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS ask_confidence_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS credential_status_enum;`);
}

import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_integration_credentials
    ADD CONSTRAINT check_credential_status
    CHECK (status IN ('connected', 'revoked'));
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_integration_credentials
    DROP CONSTRAINT IF EXISTS check_credential_status;
  `);
}

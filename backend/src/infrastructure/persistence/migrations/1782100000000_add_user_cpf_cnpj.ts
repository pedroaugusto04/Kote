import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_users 
    ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT DEFAULT '';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_users 
    DROP COLUMN IF EXISTS cpf_cnpj;
  `);
}

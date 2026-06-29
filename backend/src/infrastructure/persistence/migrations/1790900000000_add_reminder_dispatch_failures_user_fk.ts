import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add foreign key constraint for user_id in kb_reminder_dispatch_failures
  // This table already has user_id but was missing the FK constraint
  pgm.sql(`
    ALTER TABLE kb_reminder_dispatch_failures 
    ADD CONSTRAINT kb_reminder_dispatch_failures_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES kb_users(id) ON DELETE CASCADE;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Remove the foreign key constraint
  pgm.sql(`
    ALTER TABLE kb_reminder_dispatch_failures 
    DROP CONSTRAINT IF EXISTS kb_reminder_dispatch_failures_user_id_fkey;
  `);
}

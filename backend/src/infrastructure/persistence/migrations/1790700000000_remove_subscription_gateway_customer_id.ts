import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Remove gateway_customer_id from kb_user_subscriptions
  // This information is now available through kb_billing_customers table
  pgm.sql('ALTER TABLE kb_user_subscriptions DROP COLUMN IF EXISTS gateway_customer_id;');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Restore the column
  pgm.sql('ALTER TABLE kb_user_subscriptions ADD COLUMN IF NOT EXISTS gateway_customer_id TEXT;');
}

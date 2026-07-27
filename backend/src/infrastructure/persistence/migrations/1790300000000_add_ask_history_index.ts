import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create composite index for efficient querying by user_id with ordering by created_at
  // This improves performance for the ask history list endpoint which filters by userId
  // and orders by createdAt DESC
  pgm.createIndex('kb_ask_history', ['user_id', 'created_at DESC'], {
    name: 'idx_ask_history_user_created',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('kb_ask_history', ['user_id', 'created_at'], {
    name: 'idx_ask_history_user_created',
  });
}

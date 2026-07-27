import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Truncate legacy records to allow adding a NOT NULL column without default constraint violation
  pgm.sql('DELETE FROM kb_ask_history;');

  // 2. Add conversation_id column as NOT NULL UUID
  pgm.addColumn('kb_ask_history', {
    conversation_id: { type: 'uuid', notNull: true },
  });

  // 3. Create index for fast grouping and query retrieval
  pgm.createIndex('kb_ask_history', ['conversation_id'], {
    name: 'idx_ask_history_conversation_id',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('kb_ask_history', ['conversation_id'], {
    name: 'idx_ask_history_conversation_id',
  });
  pgm.dropColumn('kb_ask_history', 'conversation_id');
}

import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Use idempotent SQL to avoid failing when columns already exist (tests may run migrations multiple times)
  pgm.sql("ALTER TABLE kb_notes ADD COLUMN IF NOT EXISTS auto_action text NOT NULL DEFAULT 'none'");
  pgm.sql("ALTER TABLE kb_notes ADD COLUMN IF NOT EXISTS auto_after_hours integer");
  pgm.sql("ALTER TABLE kb_notes ADD COLUMN IF NOT EXISTS auto_scheduled_at timestamp with time zone");
  pgm.sql("CREATE INDEX IF NOT EXISTS idx_kb_notes_auto_action ON kb_notes (user_id, auto_action)");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('kb_notes', [], { name: 'idx_kb_notes_auto_action' });
  pgm.dropColumn('kb_notes', 'auto_scheduled_at');
  pgm.dropColumn('kb_notes', 'auto_after_hours');
  pgm.dropColumn('kb_notes', 'auto_action');
}

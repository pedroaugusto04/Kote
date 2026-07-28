import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Rename column from camelCase (lowercased by PostgreSQL) to snake_case if it exists
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'kb_workspaces' 
        AND column_name = 'dependencywatcherenabled'
      ) THEN
        ALTER TABLE kb_workspaces RENAME COLUMN dependencywatcherenabled TO dependency_watcher_enabled;
      END IF;
    END $$;
  `);
  
  // Add column with snake_case name if it doesn't exist (idempotent)
  pgm.sql(`
    ALTER TABLE kb_workspaces 
    ADD COLUMN IF NOT EXISTS dependency_watcher_enabled BOOLEAN NOT NULL DEFAULT false;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('kb_workspaces', 'dependency_watcher_enabled');
}

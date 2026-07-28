import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create the dependency_urgency enum using SQL
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dependency_urgency') THEN
        CREATE TYPE dependency_urgency AS ENUM ('optional', 'recommended', 'critical');
      END IF;
    END $$;
  `);
  
  // Add the last_urgency column to kb_dependency_watch
  pgm.sql(`
    ALTER TABLE kb_dependency_watch 
    ADD COLUMN IF NOT EXISTS last_urgency dependency_urgency;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Remove the last_urgency column
  pgm.dropColumn('kb_dependency_watch', 'last_urgency');
  
  // Drop the dependency_urgency enum
  pgm.sql(`
    DROP TYPE IF EXISTS dependency_urgency;
  `);
}

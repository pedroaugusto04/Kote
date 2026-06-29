import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add project_id and workspace_id columns as nullable first
  pgm.sql('ALTER TABLE kb_ask_history ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES kb_projects(id) ON DELETE SET NULL;');
  pgm.sql('ALTER TABLE kb_ask_history ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');

  // 2. Populate workspace_id from project_slug (via projects table)
  pgm.sql(`
    UPDATE kb_ask_history h
    SET workspace_id = p.workspace_id
    FROM kb_projects p
    WHERE p.user_id = h.user_id AND p.project_slug = h.project_slug;
  `);

  // 3. Populate project_id from project_slug
  pgm.sql(`
    UPDATE kb_ask_history h
    SET project_id = p.id
    FROM kb_projects p
    WHERE p.user_id = h.user_id AND p.project_slug = h.project_slug;
  `);

  // 4. Delete rows where workspace_id is still NULL (orphaned data)
  pgm.sql('DELETE FROM kb_ask_history WHERE workspace_id IS NULL;');

  // 5. Keep workspace_id nullable to allow for transition period

  // 6. Drop the old project_slug column
  pgm.sql('ALTER TABLE kb_ask_history DROP COLUMN IF EXISTS project_slug;');

  // 7. Drop the old index that used project_slug
  pgm.sql('DROP INDEX IF EXISTS kb_ask_history_user_project_created_idx;');

  // 8. Create new index using UUIDs
  pgm.sql('CREATE INDEX kb_ask_history_user_project_created_idx ON kb_ask_history (user_id, project_id, created_at);');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Reverse the changes
  pgm.sql('DROP INDEX IF EXISTS kb_ask_history_user_project_created_idx;');

  pgm.sql('ALTER TABLE kb_ask_history ADD COLUMN IF NOT EXISTS project_slug TEXT NOT NULL DEFAULT \'\';');

  pgm.sql('ALTER TABLE kb_ask_history DROP COLUMN IF EXISTS project_id;');
  pgm.sql('ALTER TABLE kb_ask_history DROP COLUMN IF EXISTS workspace_id;');

  pgm.sql('CREATE INDEX kb_ask_history_user_project_created_idx ON kb_ask_history (user_id, project_slug, created_at);');
}

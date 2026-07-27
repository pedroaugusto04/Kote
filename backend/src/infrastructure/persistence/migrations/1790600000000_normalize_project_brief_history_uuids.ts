import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add workspace_id column as nullable first
  pgm.sql('ALTER TABLE kb_project_brief_history ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');

  // 2. Populate workspace_id from workspace_slug
  pgm.sql(`
    UPDATE kb_project_brief_history h
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.user_id = h.user_id AND w.workspace_slug = h.workspace_slug;
  `);

  // 3. Delete rows where workspace_id is still NULL (orphaned data)
  pgm.sql('DELETE FROM kb_project_brief_history WHERE workspace_id IS NULL;');

  // 4. Keep workspace_id and project_id nullable to support both workspace-scoped and project-scoped brief history

  // 6. Drop the old slug columns
  pgm.sql('ALTER TABLE kb_project_brief_history DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_project_brief_history DROP COLUMN IF EXISTS project_slug;');

  // 7. Drop the old index that used slugs
  pgm.sql('DROP INDEX IF EXISTS idx_project_brief_history_user_workspace_project;');

  // 8. Create new index using UUIDs
  pgm.sql('CREATE INDEX idx_project_brief_history_user_workspace_project ON kb_project_brief_history (user_id, workspace_id, project_id);');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Reverse the changes - this is complex because we need to restore slugs
  // For simplicity, we'll add the columns back but won't migrate data
  pgm.sql('DROP INDEX IF EXISTS idx_project_brief_history_user_workspace_project;');

  pgm.sql('ALTER TABLE kb_project_brief_history ADD COLUMN IF NOT EXISTS workspace_slug TEXT NOT NULL DEFAULT \'\';');
  pgm.sql('ALTER TABLE kb_project_brief_history ADD COLUMN IF NOT EXISTS project_slug TEXT NOT NULL DEFAULT \'\';');

  pgm.sql('ALTER TABLE kb_project_brief_history ALTER COLUMN project_id DROP NOT NULL;');

  pgm.sql('ALTER TABLE kb_project_brief_history DROP COLUMN IF EXISTS workspace_id;');

  pgm.sql('CREATE INDEX idx_project_brief_history_user_workspace_project ON kb_project_brief_history (user_id, workspace_slug, project_slug);');
}

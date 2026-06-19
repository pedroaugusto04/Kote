import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add nullable UUID columns for workspaces and projects
  pgm.sql('ALTER TABLE kb_notes ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES kb_projects(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_notes ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_projects ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_project_folders ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES kb_projects(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_integration_credentials ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_external_identities ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_integration_connection_sessions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_conversation_states ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_reminder_dispatch_state ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_reminder_dispatch_failures ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_project_brief_history ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES kb_projects(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_repositories ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');
  pgm.sql('ALTER TABLE kb_webhook_subscriptions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES kb_workspaces(id) ON DELETE CASCADE;');

  // 2. Populate new columns with matching data from old slug columns
  pgm.sql(`
    UPDATE kb_projects p
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.user_id = p.user_id AND w.workspace_slug = p.workspace_slug;
  `);

  pgm.sql(`
    UPDATE kb_notes n
    SET project_id = p.id
    FROM kb_projects p
    WHERE p.user_id = n.user_id AND p.project_slug = n.project_slug;
  `);

  pgm.sql(`
    UPDATE kb_notes n
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.user_id = n.user_id AND w.workspace_slug = n.workspace_slug;
  `);

  pgm.sql(`
    UPDATE kb_project_folders f
    SET project_id = p.id
    FROM kb_projects p
    WHERE p.user_id = f.user_id AND p.project_slug = f.project_slug;
  `);

  pgm.sql(`
    UPDATE kb_integration_credentials c
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.user_id = c.user_id AND w.workspace_slug = c.workspace_slug;
  `);

  pgm.sql(`
    UPDATE kb_external_identities e
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.user_id = e.user_id AND w.workspace_slug = e.workspace_slug;
  `);

  pgm.sql(`
    UPDATE kb_integration_connection_sessions s
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.user_id = s.user_id AND w.workspace_slug = s.workspace_slug;
  `);

  pgm.sql(`
    UPDATE kb_conversation_states c
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.user_id = c.user_id AND w.workspace_slug = c.workspace_slug;
  `);

  pgm.sql(`
    UPDATE kb_reminder_dispatch_state r
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.user_id = r.user_id AND w.workspace_slug = r.workspace_slug;
  `);

  pgm.sql(`
    UPDATE kb_reminder_dispatch_failures f
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.user_id = f.user_id AND w.workspace_slug = f.workspace_slug;
  `);

  pgm.sql(`
    UPDATE kb_project_brief_history h
    SET project_id = p.id
    FROM kb_projects p
    WHERE p.user_id = h.user_id AND p.project_slug = h.project_slug;
  `);

  pgm.sql(`
    UPDATE kb_repositories r
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.workspace_slug = r.workspace_slug;
  `);

  pgm.sql(`
    UPDATE kb_webhook_subscriptions s
    SET workspace_id = w.id
    FROM kb_workspaces w
    WHERE w.user_id = s.user_id AND w.workspace_slug = s.workspace_slug;
  `);

  // 2.5 Delete orphan rows that don't match any active workspace or project
  pgm.sql('DELETE FROM kb_notes WHERE workspace_id IS NULL;');
  pgm.sql('DELETE FROM kb_projects WHERE workspace_id IS NULL;');
  pgm.sql('DELETE FROM kb_project_folders WHERE project_id IS NULL;');
  pgm.sql('DELETE FROM kb_integration_credentials WHERE workspace_id IS NULL;');
  pgm.sql('DELETE FROM kb_external_identities WHERE workspace_id IS NULL;');
  pgm.sql('DELETE FROM kb_integration_connection_sessions WHERE workspace_id IS NULL;');
  pgm.sql('DELETE FROM kb_conversation_states WHERE workspace_id IS NULL;');
  pgm.sql('DELETE FROM kb_reminder_dispatch_state WHERE workspace_id IS NULL;');
  pgm.sql('DELETE FROM kb_reminder_dispatch_failures WHERE workspace_id IS NULL;');
  pgm.sql('DELETE FROM kb_project_brief_history WHERE project_id IS NULL;');
  pgm.sql('DELETE FROM kb_repositories WHERE workspace_id IS NULL;');
  pgm.sql('DELETE FROM kb_webhook_subscriptions WHERE workspace_id IS NULL;');

  // 3. Make the new columns NOT NULL (except nullable references where appropriate)
  pgm.sql('ALTER TABLE kb_notes ALTER COLUMN workspace_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_projects ALTER COLUMN workspace_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_project_folders ALTER COLUMN project_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_integration_credentials ALTER COLUMN workspace_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_external_identities ALTER COLUMN workspace_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_integration_connection_sessions ALTER COLUMN workspace_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_conversation_states ALTER COLUMN workspace_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_reminder_dispatch_state ALTER COLUMN workspace_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_reminder_dispatch_failures ALTER COLUMN workspace_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_project_brief_history ALTER COLUMN project_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_repositories ALTER COLUMN workspace_id SET NOT NULL;');
  pgm.sql('ALTER TABLE kb_webhook_subscriptions ALTER COLUMN workspace_id SET NOT NULL;');

  // 3.5 Recreate primary keys with workspace_id instead of workspace_slug
  pgm.sql('ALTER TABLE kb_conversation_states DROP CONSTRAINT IF EXISTS kb_conversation_states_pkey;');
  pgm.sql('ALTER TABLE kb_conversation_states ADD PRIMARY KEY (user_id, workspace_id, conversation_key);');

  pgm.sql('ALTER TABLE kb_reminder_dispatch_state DROP CONSTRAINT IF EXISTS kb_reminder_dispatch_state_pkey;');
  pgm.sql('ALTER TABLE kb_reminder_dispatch_state ADD PRIMARY KEY (user_id, workspace_id, mode, dispatch_key, reminder_id);');

  pgm.sql('ALTER TABLE kb_reminder_dispatch_failures DROP CONSTRAINT IF EXISTS kb_reminder_dispatch_failures_pkey;');
  pgm.sql('ALTER TABLE kb_reminder_dispatch_failures ADD PRIMARY KEY (user_id, workspace_id, mode, dispatch_key, reminder_id, channel);');

  // 4. Drop old slug columns
  pgm.sql('ALTER TABLE kb_notes DROP COLUMN IF EXISTS project_slug;');
  pgm.sql('ALTER TABLE kb_notes DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_projects DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_project_folders DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_project_folders DROP COLUMN IF EXISTS project_slug;');
  pgm.sql('ALTER TABLE kb_integration_credentials DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_external_identities DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_integration_connection_sessions DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_conversation_states DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_reminder_dispatch_state DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_reminder_dispatch_failures DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_project_brief_history DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_project_brief_history DROP COLUMN IF EXISTS project_slug;');
  pgm.sql('ALTER TABLE kb_repositories DROP COLUMN IF EXISTS workspace_slug;');
  pgm.sql('ALTER TABLE kb_webhook_subscriptions DROP COLUMN IF EXISTS workspace_slug;');

  // 5. Drop unused metadata and frontmatter columns
  pgm.sql('ALTER TABLE kb_notes DROP COLUMN IF EXISTS frontmatter;');
  pgm.sql('ALTER TABLE kb_external_identities DROP COLUMN IF EXISTS metadata;');
  pgm.sql('ALTER TABLE kb_external_identities DROP COLUMN IF EXISTS public_metadata;');
  pgm.sql('ALTER TABLE kb_attachments DROP COLUMN IF EXISTS metadata;');
}

export async function down(pgm: MigrationBuilder): Promise<void> {

}

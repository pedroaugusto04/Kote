import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Create repositories catalog table
  pgm.createTable('kb_repositories', {
    id: { type: 'uuid', primaryKey: true },
    workspace_slug: { type: 'text', notNull: true },
    external_id: { type: 'bigint', notNull: true },
    full_name: { type: 'text', notNull: true },
    html_url: { type: 'text' },
    description: { type: 'text' },
    default_branch: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  });
  
  // A repository is unique per workspace and external ID
  pgm.createIndex('kb_repositories', ['workspace_slug', 'external_id'], { unique: true });

  // 2. Add repository_id to junction table
  pgm.addColumn('kb_project_repositories', {
    repository_id: { type: 'uuid', references: 'kb_repositories(id)', onDelete: 'CASCADE' }
  });

  // 3. Migrate existing data (create placeholder repositories for existing junction entries)
  // We use gen_random_uuid() for the new IDs.
  pgm.sql(`
    INSERT INTO kb_repositories (id, workspace_slug, external_id, full_name)
    SELECT DISTINCT
      gen_random_uuid(),
      p.workspace_slug,
      pr.external_repo_id,
      pr.repo_full_name
    FROM kb_project_repositories pr
    JOIN kb_projects p ON p.id = pr.project_id
    WHERE pr.external_repo_id > 0 OR pr.repo_full_name != ''
    ON CONFLICT DO NOTHING
  `);

  // 4. Link junction table to new repositories
  pgm.sql(`
    UPDATE kb_project_repositories pr
    SET repository_id = r.id
    FROM kb_projects p, kb_repositories r
    WHERE pr.project_id = p.id
      AND p.workspace_slug = r.workspace_slug
      AND (pr.external_repo_id = r.external_id OR pr.repo_full_name = r.full_name)
  `);

  // 5. Clean up old junction table columns and constraints
  pgm.dropConstraint('kb_project_repositories', 'kb_project_repositories_pk');
  pgm.sql(`DELETE FROM kb_project_repositories WHERE repository_id IS NULL`);
  pgm.alterColumn('kb_project_repositories', 'repository_id', { notNull: true });
  pgm.addConstraint('kb_project_repositories', 'kb_project_repositories_pk', { primaryKey: ['project_id', 'repository_id'] });
  
  pgm.dropColumns('kb_project_repositories', ['external_repo_id', 'repo_full_name']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // 1. Restore columns
  pgm.addColumns('kb_project_repositories', {
    external_repo_id: { type: 'bigint', notNull: true, default: 0 },
    repo_full_name: { type: 'text', notNull: true, default: '' }
  });

  // 2. Restore data
  pgm.sql(`
    UPDATE kb_project_repositories pr
    SET 
      external_repo_id = r.external_id,
      repo_full_name = r.full_name
    FROM kb_repositories r
    WHERE pr.repository_id = r.id
  `);

  // 3. Drop new constraints and columns
  pgm.dropConstraint('kb_project_repositories', 'kb_project_repositories_pk');
  pgm.addConstraint('kb_project_repositories', 'kb_project_repositories_pk', { primaryKey: ['project_id', 'repo_full_name'] });
  pgm.dropColumn('kb_project_repositories', 'repository_id');

  // 4. Drop table
  pgm.dropTable('kb_repositories');
}

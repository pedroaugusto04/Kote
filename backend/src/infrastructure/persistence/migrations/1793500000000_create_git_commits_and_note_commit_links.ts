import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS kb_git_commits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES kb_users(id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL REFERENCES kb_workspaces(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES kb_projects(id) ON DELETE CASCADE,
      repository_full_name text NOT NULL DEFAULT '',
      commit_sha text NOT NULL,
      parent_sha text NOT NULL DEFAULT '',
      branch text NOT NULL DEFAULT '',
      message text NOT NULL DEFAULT '',
      author_name text NOT NULL DEFAULT '',
      author_email text NOT NULL DEFAULT '',
      committed_at timestamptz NOT NULL DEFAULT now(),
      commit_url text NOT NULL DEFAULT '',
      changed_files jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS kb_git_commits_user_project_sha_uidx
      ON kb_git_commits (user_id, project_id, commit_sha);
    CREATE INDEX IF NOT EXISTS kb_git_commits_user_project_committed_at_idx
      ON kb_git_commits (user_id, project_id, committed_at DESC);
    CREATE INDEX IF NOT EXISTS kb_git_commits_user_sha_idx
      ON kb_git_commits (user_id, commit_sha);

    CREATE TABLE IF NOT EXISTS kb_note_commit_links (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES kb_users(id) ON DELETE CASCADE,
      note_id uuid NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
      commit_id uuid NOT NULL REFERENCES kb_git_commits(id) ON DELETE CASCADE,
      link_source text NOT NULL DEFAULT 'working_tree',
      matched_files jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS kb_note_commit_links_note_commit_uidx
      ON kb_note_commit_links (note_id, commit_id);
    CREATE INDEX IF NOT EXISTS kb_note_commit_links_user_note_idx
      ON kb_note_commit_links (user_id, note_id);
    CREATE INDEX IF NOT EXISTS kb_note_commit_links_user_commit_idx
      ON kb_note_commit_links (user_id, commit_id);

    -- Backfill existing notes that already carry a commit SHA in metadata
    INSERT INTO kb_git_commits (
      user_id,
      workspace_id,
      project_id,
      repository_full_name,
      commit_sha,
      branch,
      message,
      committed_at,
      commit_url,
      changed_files
    )
    SELECT DISTINCT ON (
      n.user_id,
      n.project_id,
      lower(trim(coalesce(n.metadata->>'headSha', n.metadata->>'commitHash', n.metadata->>'commit', '')))
    )
      n.user_id,
      n.workspace_id,
      n.project_id,
      coalesce(n.metadata->>'repoFullName', ''),
      lower(trim(coalesce(n.metadata->>'headSha', n.metadata->>'commitHash', n.metadata->>'commit', ''))) AS commit_sha,
      coalesce(n.metadata->>'branch', n.metadata->>'headBranch', ''),
      coalesce(nullif(trim(n.metadata->>'rawText'), ''), n.title),
      coalesce(n.occurred_at, n.created_at, now()),
      coalesce(n.metadata->>'compareUrl', n.metadata->>'prUrl', ''),
      CASE
        WHEN jsonb_typeof(n.metadata->'changedFiles') = 'array' THEN n.metadata->'changedFiles'
        ELSE '[]'::jsonb
      END
    FROM kb_notes n
    WHERE n.project_id IS NOT NULL
      AND length(trim(coalesce(n.metadata->>'headSha', n.metadata->>'commitHash', n.metadata->>'commit', ''))) >= 7
    ON CONFLICT (user_id, project_id, commit_sha) DO NOTHING;

    INSERT INTO kb_note_commit_links (
      user_id,
      note_id,
      commit_id,
      link_source,
      matched_files
    )
    SELECT
      n.user_id,
      n.id,
      c.id,
      CASE
        WHEN n.source_channel = 'ai-chat' THEN 'agent_commit'
        ELSE 'github_push'
      END,
      c.changed_files
    FROM kb_notes n
    JOIN kb_git_commits c
      ON c.user_id = n.user_id
     AND c.project_id = n.project_id
     AND c.commit_sha = lower(trim(coalesce(n.metadata->>'headSha', n.metadata->>'commitHash', n.metadata->>'commit', '')))
    WHERE n.project_id IS NOT NULL
    ON CONFLICT (note_id, commit_id) DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS kb_note_commit_links;
    DROP TABLE IF EXISTS kb_git_commits;
  `);
}

import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Ensure any remaining notes with commit hashes in metadata are backfilled into kb_git_commits
  pgm.sql(`
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
        WHEN n.source_channel = 'ai-chat' THEN 'ai_terminal'
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

  // 2. Clean up legacy commit keys and legacy proximity heuristics from kb_notes.metadata
  // Keeps metadata clean, structured, and avoids desynchronization with kb_note_commit_links.
  pgm.sql(`
    UPDATE kb_notes
    SET metadata = (metadata - 'commitHash' - 'commit' - 'codeLineage')
    WHERE metadata ? 'commitHash'
       OR metadata ? 'commit'
       OR metadata ? 'codeLineage';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // No-op rollback for data cleanup: dropped keys cannot be unambiguously synthesized back,
  // but relational links remain intact in kb_git_commits and kb_note_commit_links.
}

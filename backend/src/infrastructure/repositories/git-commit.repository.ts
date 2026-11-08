import crypto from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { GitCommitRepository } from '../../application/ports/projects/git-commit.repository.js';
import type {
  CommitLinkSource,
  LinkedCommitNoteSummary,
  LinkedCommitSummary,
  ListProjectCommitsInput,
  ListProjectCommitsResult,
  ProjectCommitItem,
  SyncGitCommitInput,
} from '../../application/models/git-commits.models.js';
import type { NoteRecord } from '../../application/models/repository-records.models.js';
import { buildPaginationMeta } from '../../contracts/pagination.js';
import { normalizeFilePath } from '../../domain/utils/file-path.utils.js';
import { isUuid } from '../../domain/utils/uuid.utils.js';
import { linkedCommitFromRow, toIsoTimestamp } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

function normalizeSha(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[0-9a-f]{7,64}$/.test(raw) ? raw : '';
}

function normalizeChangedFiles(files: unknown): string[] {
  if (!Array.isArray(files)) return [];
  const normalized = files
    .filter((f): f is string => typeof f === 'string')
    .map((f) => normalizeFilePath(f))
    .filter(Boolean);
  return [...new Set(normalized)];
}

function filesMatch(commitFile: string, noteFile: string): boolean {
  const a = normalizeFilePath(commitFile);
  const b = normalizeFilePath(noteFile);
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  // Require at least one directory segment on suffix matches so bare filenames
  // like "package.json" or "index.ts" do not cross-match unrelated subdirectories.
  if (!shorter.includes('/')) return false;
  return longer.endsWith(`/${shorter}`);
}

const NOISY_LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'cargo.lock',
  'poetry.lock',
  'composer.lock',
]);

function filterSignalFiles(files: string[]): string[] {
  const signal = files.filter((f) => {
    const base = f.split('/').pop()?.toLowerCase() || '';
    return !NOISY_LOCKFILES.has(base);
  });
  return signal.length > 0 ? signal : files;
}

function intersectFiles(commitFiles: string[], noteFiles: string[]): string[] {
  if (commitFiles.length === 0 || noteFiles.length === 0) return [];
  const matched = new Set<string>();
  for (const commitFile of commitFiles) {
    for (const noteFile of noteFiles) {
      if (filesMatch(commitFile, noteFile)) {
        matched.add(normalizeFilePath(commitFile));
      }
    }
  }
  return [...matched];
}

function confidenceForLinkSource(linkSource: CommitLinkSource, matchedFilesCount = 0): number {
  if (linkSource === 'manual' || linkSource === 'ai_terminal' || linkSource === 'github_push') {
    return 100;
  }
  return Math.min(95, 70 + matchedFilesCount * 10);
}

function extractNoteDeterministicShas(metadata: Record<string, unknown>): Array<{ sha: string; source: CommitLinkSource }> {
  const entries: Array<{ sha: string; source: CommitLinkSource }> = [];
  const seen = new Set<string>();

  const gitActivity = (metadata?.gitActivity && typeof metadata.gitActivity === 'object')
    ? (metadata.gitActivity as Record<string, unknown>)
    : null;

  if (gitActivity && Array.isArray(gitActivity.createdCommitShas)) {
    for (const raw of gitActivity.createdCommitShas) {
      const sha = normalizeSha(raw);
      if (sha && !seen.has(sha)) {
        seen.add(sha);
        entries.push({ sha, source: 'ai_terminal' });
      }
    }
  }

  for (const key of ['headSha', 'commitHash', 'commit']) {
    const sha = normalizeSha(metadata?.[key]);
    if (sha && !seen.has(sha)) {
      seen.add(sha);
      const isGithub = Boolean(
        metadata?.repository ||
        metadata?.repoFullName ||
        metadata?.prUrl ||
        metadata?.eventType === 'code-review',
      );
      entries.push({ sha, source: isGithub ? 'github_push' : 'ai_terminal' });
    }
  }

  return entries;
}

function extractNoteBranch(metadata: Record<string, unknown>): string {
  const gitActivity = (metadata?.gitActivity && typeof metadata.gitActivity === 'object')
    ? (metadata.gitActivity as Record<string, unknown>)
    : null;
  if (typeof metadata?.branch === 'string' && metadata.branch.trim()) {
    return metadata.branch.trim();
  }
  if (typeof gitActivity?.branch === 'string' && gitActivity.branch.trim()) {
    return gitActivity.branch.trim();
  }
  return '';
}

function resolveNoteSessionSpanIso(note: { createdAt?: string | null; occurredAt?: string | null }): {
  startIso: string;
  endIso: string;
} {
  const occurredMs = note.occurredAt ? Date.parse(note.occurredAt) : Number.NaN;
  const createdMs = note.createdAt ? Date.parse(note.createdAt) : Number.NaN;
  const effectiveEndMs = !Number.isNaN(occurredMs)
    ? occurredMs
    : !Number.isNaN(createdMs)
      ? createdMs
      : Date.now();
  const effectiveStartMs = !Number.isNaN(createdMs) && createdMs < effectiveEndMs
    ? createdMs
    : effectiveEndMs;
  return {
    startIso: new Date(effectiveStartMs).toISOString(),
    endIso: new Date(effectiveEndMs).toISOString(),
  };
}

function extractNoteTouchedFiles(note: Pick<NoteRecord, 'path' | 'metadata'>): string[] {
  const metadata = note.metadata || {};
  const gitActivity = (metadata.gitActivity && typeof metadata.gitActivity === 'object')
    ? (metadata.gitActivity as Record<string, unknown>)
    : null;

  const files = [
    ...(Array.isArray(metadata.changedFiles) ? metadata.changedFiles : []),
    ...(gitActivity && Array.isArray(gitActivity.touchedFiles) ? gitActivity.touchedFiles : []),
    ...(note.path && !note.path.startsWith('20 Inbox/') ? [note.path] : []),
  ];

  return normalizeChangedFiles(files);
}

@Injectable()
export class PostgresGitCommitRepository extends GitCommitRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  private getQueryable(tx?: unknown): Queryable {
    if (tx) {
      if (typeof (tx as PoolClient).query === 'function') {
        return tx as PoolClient;
      }
      const sessionClient = (tx as { session?: { client?: PoolClient } }).session?.client;
      if (sessionClient && typeof sessionClient.query === 'function') {
        return sessionClient;
      }
    }
    return this.database.getPool();
  }

  async upsertCommitsAndReconcile(
    userId: string,
    scope: { workspaceId: string; projectId: string },
    commits: SyncGitCommitInput[],
  ): Promise<{ syncedCount: number; linkedCount: number }> {
    const pool = this.database.getPool();
    let syncedCount = 0;
    let linkedCount = 0;

    // Sort commits chronologically (oldest first) so that an AI session's modified files
    // are consumed by the first commit after the session rather than duplicated across subsequent commits.
    const orderedCommits = [...commits].sort((a, b) => {
      const aTime = a.committedAt ? Date.parse(a.committedAt) : 0;
      const bTime = b.committedAt ? Date.parse(b.committedAt) : 0;
      return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
    });

    for (const rawCommit of orderedCommits) {
      const commitSha = normalizeSha(rawCommit.commitSha);
      if (!commitSha) continue;

      const changedFiles = normalizeChangedFiles(rawCommit.changedFiles);
      const committedAt = rawCommit.committedAt && !Number.isNaN(Date.parse(rawCommit.committedAt))
        ? new Date(rawCommit.committedAt).toISOString()
        : new Date().toISOString();
      const commitBranch = rawCommit.branch ? String(rawCommit.branch).trim() : '';

      // Upgrade any prefix-only placeholder commit row (e.g. 7-char SHA from terminal output) before upserting full SHA
      if (commitSha.length >= 12) {
        await pool.query(
          `UPDATE kb_git_commits
           SET commit_sha = $3,
               updated_at = now()
           WHERE user_id = $1
             AND project_id = $2
             AND length(commit_sha) < length($3)
             AND $3 LIKE commit_sha || '%'
             AND NOT EXISTS (
               SELECT 1 FROM kb_git_commits existing
               WHERE existing.user_id = $1 AND existing.project_id = $2 AND existing.commit_sha = $3
             )`,
          [userId, scope.projectId, commitSha],
        );
      }

      const parentSha = Array.isArray(rawCommit.parentShas) && rawCommit.parentShas[0]
        ? normalizeSha(rawCommit.parentShas[0])
        : '';

      const upsertRes = await pool.query(
        `INSERT INTO kb_git_commits (
           id, user_id, workspace_id, project_id, repository_full_name,
           commit_sha, parent_sha, branch, message, author_name, author_email,
           committed_at, commit_url, changed_files, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, '',
           $5, $6, $7, $8, $9, $10,
           $11::timestamptz, $12, $13::jsonb, now(), now()
         )
         ON CONFLICT (user_id, project_id, commit_sha) DO UPDATE SET
           message = CASE WHEN EXCLUDED.message <> '' THEN EXCLUDED.message ELSE kb_git_commits.message END,
           author_name = CASE WHEN EXCLUDED.author_name <> '' THEN EXCLUDED.author_name ELSE kb_git_commits.author_name END,
           author_email = CASE WHEN EXCLUDED.author_email <> '' THEN EXCLUDED.author_email ELSE kb_git_commits.author_email END,
           committed_at = EXCLUDED.committed_at,
           branch = CASE WHEN EXCLUDED.branch <> '' THEN EXCLUDED.branch ELSE kb_git_commits.branch END,
           parent_sha = CASE WHEN EXCLUDED.parent_sha <> '' THEN EXCLUDED.parent_sha ELSE kb_git_commits.parent_sha END,
           changed_files = CASE WHEN jsonb_array_length(EXCLUDED.changed_files) > 0 THEN EXCLUDED.changed_files ELSE kb_git_commits.changed_files END,
           commit_url = CASE WHEN EXCLUDED.commit_url <> '' THEN EXCLUDED.commit_url ELSE kb_git_commits.commit_url END,
           updated_at = now()
         RETURNING id, changed_files, branch`,
        [
          crypto.randomUUID(),
          userId,
          scope.workspaceId,
          scope.projectId,
          commitSha,
          parentSha,
          commitBranch,
          String(rawCommit.message || '').trim(),
          String(rawCommit.authorName || '').trim(),
          String(rawCommit.authorEmail || '').trim(),
          committedAt,
          rawCommit.htmlUrl ? String(rawCommit.htmlUrl).trim() : '',
          JSON.stringify(changedFiles),
        ],
      );

      const commitRow = upsertRes.rows[0];
      if (!commitRow) continue;
      syncedCount += 1;
      const commitId = String(commitRow.id);
      const effectiveChangedFiles = normalizeChangedFiles(commitRow.changed_files);
      const effectiveCommitBranch = String(commitRow.branch || commitBranch || '').trim();

      // 1. Explicit candidate links (deterministic links from IDE terminal or GitHub push)
      if (Array.isArray(rawCommit.candidateSessionLinks)) {
        for (const candidate of rawCommit.candidateSessionLinks) {
          const linkSource = candidate.linkSource || 'session_files';
          // Only accept deterministic links directly here; session_files candidates are reconciled
          // against strict database rules below to prevent cross-commit or GitHub note pollution.
          if (linkSource === 'session_files') continue;

          let targetNoteId: string | null = null;
          if (candidate.noteId && isUuid(candidate.noteId)) {
            const found = await pool.query(
              `SELECT id FROM kb_notes WHERE id = $1 AND user_id = $2 LIMIT 1`,
              [candidate.noteId, userId],
            );
            targetNoteId = found.rows[0] ? String(found.rows[0].id) : null;
          } else if (candidate.source && candidate.sessionId) {
            const found = await pool.query(
              `SELECT id FROM kb_notes WHERE user_id = $1 AND source = $2 AND session_id = $3 LIMIT 1`,
              [userId, candidate.source, candidate.sessionId],
            );
            targetNoteId = found.rows[0] ? String(found.rows[0].id) : null;
          }

          if (targetNoteId) {
            await this.upsertNoteCommitLink(pool, {
              userId,
              noteId: targetNoteId,
              commitId,
              linkSource,
              matchedFiles: normalizeChangedFiles(candidate.matchedFiles),
            });
            linkedCount += 1;
          }
        }
      }

      // 2A. Reconcile deterministic SHA matches ONLY (notes carrying headSha, commitHash, commit, or gitActivity.createdCommitShas)
      const shaCandidatesRes = await pool.query(
        `SELECT n.id, n.path, n.metadata
         FROM kb_notes n
         WHERE n.user_id = $1
           AND n.project_id = $2
           AND (
             (
               length(trim(coalesce(n.metadata->>'headSha', n.metadata->>'commitHash', n.metadata->>'commit', ''))) >= 7
               AND (
                 $3 LIKE lower(trim(coalesce(n.metadata->>'headSha', n.metadata->>'commitHash', n.metadata->>'commit', ''))) || '%'
                 OR lower(trim(coalesce(n.metadata->>'headSha', n.metadata->>'commitHash', n.metadata->>'commit', ''))) LIKE $3 || '%'
               )
             )
             OR jsonb_typeof(n.metadata->'gitActivity'->'createdCommitShas') = 'array'
           )`,
        [userId, scope.projectId, commitSha],
      );

      for (const noteRow of shaCandidatesRes.rows) {
        const noteId = String(noteRow.id);
        const metadata = (noteRow.metadata || {}) as Record<string, unknown>;
        const deterministicShas = extractNoteDeterministicShas(metadata);
        const directMatch = deterministicShas.find(
          (entry) => commitSha.startsWith(entry.sha) || entry.sha.startsWith(commitSha),
        );
        if (!directMatch) continue;

        const noteFiles = extractNoteTouchedFiles({ path: String(noteRow.path || ''), metadata });
        const matchedFiles = intersectFiles(effectiveChangedFiles, noteFiles);

        await this.upsertNoteCommitLink(pool, {
          userId,
          noteId,
          commitId,
          linkSource: directMatch.source,
          matchedFiles: matchedFiles.length > 0 ? matchedFiles : effectiveChangedFiles,
        });
        linkedCount += 1;
      }

      // 2B. Reconcile AI session file intersections (session_files)
      // Strictly restricted to AI chat sessions (never GitHub push/PR notes) whose duration + 6h window
      // (LEAST(created_at, occurred_at) - 15m to occurred_at + 6h) covers the commit, using the
      // Most-Recent-Owner-Per-File rule so each modified file is attributed only to the latest AI session
      // before the commit that touched it.
      if (effectiveChangedFiles.length > 0) {
        const signalCommitFiles = filterSignalFiles(effectiveChangedFiles);
        const unclaimedCommitFiles = new Set<string>(signalCommitFiles);

        const sessionCandidatesRes = await pool.query(
          `SELECT n.id, n.path, n.source, n.source_channel, n.created_at, n.occurred_at, n.metadata
           FROM kb_notes n
           WHERE n.user_id = $1
             AND n.project_id = $2
             AND n.source_channel = 'ai-chat'
             AND n.source NOT IN ('github', 'github push', 'github pull request')
             AND coalesce(n.metadata->>'headSha', '') = ''
             AND $3::timestamptz BETWEEN (LEAST(n.created_at, n.occurred_at) - interval '15 minutes')
                                     AND (n.occurred_at + interval '6 hours')
             AND NOT EXISTS (
               SELECT 1
               FROM kb_note_commit_links ncl
               JOIN kb_git_commits gc_prev ON gc_prev.id = ncl.commit_id
               WHERE ncl.note_id = n.id
                 AND ncl.user_id = n.user_id
                 AND gc_prev.id <> $4::uuid
                 AND gc_prev.committed_at >= (n.occurred_at - interval '15 minutes')
                 AND gc_prev.committed_at < $3::timestamptz
             )
           ORDER BY n.occurred_at DESC, n.created_at DESC`,
          [userId, scope.projectId, committedAt, commitId],
        );

        for (const noteRow of sessionCandidatesRes.rows) {
          if (unclaimedCommitFiles.size === 0) break;

          const noteId = String(noteRow.id);
          const metadata = (noteRow.metadata || {}) as Record<string, unknown>;

          // Skip if this AI session already has deterministic commit SHAs from terminal execution
          if (extractNoteDeterministicShas(metadata).length > 0) continue;

          // If both note and commit specify a branch, require them to match
          const noteBranch = extractNoteBranch(metadata);
          if (noteBranch && effectiveCommitBranch && noteBranch !== effectiveCommitBranch) {
            continue;
          }

          const noteFiles = filterSignalFiles(
            extractNoteTouchedFiles({ path: String(noteRow.path || ''), metadata }),
          );
          const newlyClaimedFiles = intersectFiles([...unclaimedCommitFiles], noteFiles);

          if (newlyClaimedFiles.length > 0) {
            for (const claimed of newlyClaimedFiles) {
              unclaimedCommitFiles.delete(claimed);
            }
            const allMatchedFiles = intersectFiles(effectiveChangedFiles, noteFiles);
            await this.upsertNoteCommitLink(pool, {
              userId,
              noteId,
              commitId,
              linkSource: 'session_files',
              matchedFiles: allMatchedFiles.length > 0 ? allMatchedFiles : newlyClaimedFiles,
            });
            linkedCount += 1;
          }
        }
      }
    }

    await this.pruneSpuriousSessionFileLinks(pool, userId);

    return { syncedCount, linkedCount };
  }

  private async pruneSpuriousSessionFileLinks(queryable: Queryable, userId: string): Promise<void> {
    await queryable.query(
      `DELETE FROM kb_note_commit_links ncl
       USING kb_notes n, kb_git_commits gc
       WHERE ncl.user_id = $1
         AND ncl.note_id = n.id
         AND ncl.commit_id = gc.id
         AND ncl.link_source = 'session_files'
         AND (
           n.source_channel <> 'ai-chat'
           OR lower(coalesce(n.source, '')) IN ('github', 'github push', 'github pull request')
           OR coalesce(n.metadata->>'headSha', '') <> ''
           OR (
             jsonb_typeof(n.metadata->'gitActivity'->'createdCommitShas') = 'array'
             AND jsonb_array_length(n.metadata->'gitActivity'->'createdCommitShas') > 0
           )
           OR gc.committed_at < (LEAST(n.created_at, n.occurred_at) - interval '15 minutes')
           OR gc.committed_at > (n.occurred_at + interval '6 hours')
         )`,
      [userId],
    );

    await queryable.query(
      `DELETE FROM kb_note_commit_links ncl
       USING kb_notes n, kb_git_commits gc
       WHERE ncl.user_id = $1
         AND ncl.note_id = n.id
         AND ncl.commit_id = gc.id
         AND ncl.link_source = 'session_files'
         AND gc.committed_at >= (n.occurred_at - interval '15 minutes')
         AND EXISTS (
           SELECT 1
           FROM kb_note_commit_links earlier_ncl
           JOIN kb_git_commits earlier_gc ON earlier_gc.id = earlier_ncl.commit_id
           WHERE earlier_ncl.note_id = ncl.note_id
             AND earlier_ncl.user_id = ncl.user_id
             AND earlier_ncl.id <> ncl.id
             AND earlier_gc.committed_at >= (n.occurred_at - interval '15 minutes')
             AND (
               earlier_gc.committed_at < gc.committed_at
               OR (earlier_gc.committed_at = gc.committed_at AND earlier_ncl.id::text < ncl.id::text)
             )
         )`,
      [userId],
    );
  }

  async reconcileNoteCommits(
    userId: string,
    note: NoteRecord,
    tx?: unknown,
  ): Promise<LinkedCommitSummary[]> {
    if (!note.projectId || !note.workspaceId) return [];
    const queryable = this.getQueryable(tx);
    const metadata = (note.metadata || {}) as Record<string, unknown>;
    const deterministicShas = extractNoteDeterministicShas(metadata);
    const touchedFiles = extractNoteTouchedFiles(note);
    const noteBranch = extractNoteBranch(metadata);

    // 1. Link deterministic SHAs (creating a commit record if not yet synced)
    for (const { sha, source } of deterministicShas) {
      const existingRes = await queryable.query(
        `SELECT id, changed_files
         FROM kb_git_commits
         WHERE user_id = $1
           AND project_id = $2
           AND (commit_sha = $3 OR commit_sha LIKE $3 || '%' OR $3 LIKE commit_sha || '%')
         ORDER BY length(commit_sha) DESC
         LIMIT 1`,
        [userId, note.projectId, sha],
      );

      let commitId: string;
      let commitChangedFiles: string[] = [];

      if (existingRes.rows[0]) {
        commitId = String(existingRes.rows[0].id);
        commitChangedFiles = normalizeChangedFiles(existingRes.rows[0].changed_files);
      } else {
        const authorName = typeof metadata.author === 'string' ? metadata.author : '';
        const committedAt = note.occurredAt && !Number.isNaN(Date.parse(note.occurredAt))
          ? new Date(note.occurredAt).toISOString()
          : new Date().toISOString();

        const insertRes = await queryable.query(
          `INSERT INTO kb_git_commits (
             id, user_id, workspace_id, project_id, repository_full_name,
             commit_sha, parent_sha, branch, message, author_name, author_email,
             committed_at, commit_url, changed_files, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, '',
             $5, '', $6, $7, $8, '',
             $9::timestamptz, '', $10::jsonb, now(), now()
           )
           ON CONFLICT (user_id, project_id, commit_sha) DO UPDATE SET
             updated_at = now()
           RETURNING id, changed_files`,
          [
            crypto.randomUUID(),
            userId,
            note.workspaceId,
            note.projectId,
            sha,
            noteBranch,
            note.title || note.summary || '',
            authorName,
            committedAt,
            JSON.stringify(touchedFiles),
          ],
        );
        commitId = String(insertRes.rows[0].id);
        commitChangedFiles = normalizeChangedFiles(insertRes.rows[0].changed_files);
      }

      const matched = intersectFiles(commitChangedFiles, touchedFiles);
      await this.upsertNoteCommitLink(queryable, {
        userId,
        noteId: note.id,
        commitId,
        linkSource: source,
        matchedFiles: matched.length > 0 ? matched : touchedFiles,
      });
    }

    // 2. If this is an AI session note without deterministic SHAs and with touchedFiles,
    // match commits occurring during the session or the first subsequent commit within 6 hours.
    const isAiChatNote = note.sourceChannel === 'ai-chat'
      && !['github', 'github push', 'github pull request'].includes((note.source || '').toLowerCase());

    if (isAiChatNote && deterministicShas.length === 0 && touchedFiles.length > 0) {
      const { startIso, endIso } = resolveNoteSessionSpanIso(note);
      const endMinusToleranceMs = Date.parse(endIso) - 15 * 60 * 1000;
      const signalTouchedFiles = filterSignalFiles(touchedFiles);

      const recentCommitsRes = await queryable.query(
        `SELECT id, branch, changed_files, committed_at
         FROM kb_git_commits
         WHERE user_id = $1
           AND project_id = $2
           AND committed_at BETWEEN ($3::timestamptz - interval '15 minutes') AND ($4::timestamptz + interval '6 hours')
         ORDER BY committed_at ASC`,
        [userId, note.projectId, startIso, endIso],
      );

      for (const commitRow of recentCommitsRes.rows) {
        const commitBranch = String(commitRow.branch || '').trim();
        if (noteBranch && commitBranch && noteBranch !== commitBranch) {
          continue;
        }
        const commitFiles = filterSignalFiles(normalizeChangedFiles(commitRow.changed_files));
        const matchedFiles = intersectFiles(commitFiles, signalTouchedFiles);
        if (matchedFiles.length > 0) {
          await this.upsertNoteCommitLink(queryable, {
            userId,
            noteId: note.id,
            commitId: String(commitRow.id),
            linkSource: 'session_files',
            matchedFiles,
          });
          const committedAtMs = Date.parse(String(commitRow.committed_at || ''));
          if (!Number.isNaN(committedAtMs) && committedAtMs >= endMinusToleranceMs) {
            // Stop after the first post-session commit that consumes the session's touched files
            break;
          }
        }
      }
    }

    const byNote = await this.listByNoteIds(userId, [note.id], queryable);
    return byNote.get(note.id) || [];
  }

  private async upsertNoteCommitLink(
    queryable: Queryable,
    input: {
      userId: string;
      noteId: string;
      commitId: string;
      linkSource: CommitLinkSource;
      matchedFiles: string[];
    },
  ): Promise<void> {
    await queryable.query(
      `INSERT INTO kb_note_commit_links (
         id, user_id, note_id, commit_id, link_source, matched_files, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, now()
       )
       ON CONFLICT (note_id, commit_id) DO UPDATE SET
         link_source = CASE
           WHEN kb_note_commit_links.link_source = 'manual' THEN 'manual'
           WHEN kb_note_commit_links.link_source IN ('ai_terminal', 'github_push') AND EXCLUDED.link_source = 'session_files'
             THEN kb_note_commit_links.link_source
           ELSE EXCLUDED.link_source
         END,
         matched_files = CASE
           WHEN jsonb_array_length(EXCLUDED.matched_files) >= jsonb_array_length(kb_note_commit_links.matched_files)
             THEN EXCLUDED.matched_files
           ELSE kb_note_commit_links.matched_files
         END`,
      [
        crypto.randomUUID(),
        input.userId,
        input.noteId,
        input.commitId,
        input.linkSource,
        JSON.stringify(input.matchedFiles),
      ],
    );
  }

  async listByNoteIds(
    userId: string,
    noteIds: string[],
    customQueryable?: Queryable,
  ): Promise<Map<string, LinkedCommitSummary[]>> {
    const map = new Map<string, LinkedCommitSummary[]>();
    const validIds = noteIds.filter(isUuid);
    if (validIds.length === 0) return map;

    const queryable = customQueryable || this.database.getPool();
    const res = await queryable.query(
      `SELECT ncl.note_id,
              gc.id,
              gc.commit_sha,
              left(gc.commit_sha, 7) AS short_sha,
              gc.message,
              gc.author_name,
              gc.committed_at,
              nullif(gc.branch, '') AS branch,
              nullif(gc.commit_url, '') AS html_url,
              ncl.link_source,
              ncl.matched_files
       FROM kb_note_commit_links ncl
       JOIN kb_git_commits gc ON gc.id = ncl.commit_id
       WHERE ncl.user_id = $1
         AND ncl.note_id = ANY($2::uuid[])
       ORDER BY gc.committed_at DESC`,
      [userId, validIds],
    );

    for (const row of res.rows) {
      const noteId = String(row.note_id);
      const list = map.get(noteId) || [];
      const linkSource = (String(row.link_source || 'manual') as CommitLinkSource);
      const matchedFiles = normalizeChangedFiles(row.matched_files);
      list.push(linkedCommitFromRow({
        ...row,
        confidence: confidenceForLinkSource(linkSource, matchedFiles.length),
      }));
      map.set(noteId, list);
    }

    return map;
  }

  async listProjectCommits(
    userId: string,
    input: ListProjectCommitsInput,
  ): Promise<ListProjectCommitsResult> {
    const pool = this.database.getPool();
    await this.pruneSpuriousSessionFileLinks(pool, userId);
    const values: unknown[] = [userId];
    const clauses: string[] = [
      'gc.user_id = $1',
    ];

    if (input.workspaceId) {
      values.push(input.workspaceId);
      clauses.push(`gc.workspace_id = $${values.length}`);
    }

    if (input.projectId && input.projectId !== 'all') {
      values.push(input.projectId);
      clauses.push(`gc.project_id = $${values.length}`);
    }

    const effectiveFilter = input.linkFilter ?? (input.onlyLinked ? 'with_notes' : 'all');

    if (effectiveFilter === 'with_notes') {
      clauses.push(
        `EXISTS (
           SELECT 1 FROM kb_note_commit_links ncl
           WHERE ncl.commit_id = gc.id AND ncl.user_id = gc.user_id
         )`,
      );
    } else if (effectiveFilter === 'ai') {
      clauses.push(
        `EXISTS (
           SELECT 1 FROM kb_note_commit_links ncl
           WHERE ncl.commit_id = gc.id AND ncl.user_id = gc.user_id
             AND ncl.link_source IN ('ai_terminal', 'session_files')
         )`,
      );
    } else if (effectiveFilter === 'manual') {
      clauses.push(
        `EXISTS (
           SELECT 1 FROM kb_note_commit_links ncl
           WHERE ncl.commit_id = gc.id AND ncl.user_id = gc.user_id
             AND ncl.link_source = 'manual'
         )`,
      );
    } else if (effectiveFilter === 'github_push') {
      clauses.push(
        `EXISTS (
           SELECT 1 FROM kb_note_commit_links ncl
           WHERE ncl.commit_id = gc.id AND ncl.user_id = gc.user_id
             AND ncl.link_source = 'github_push'
         )`,
      );
    }

    if (input.query && input.query.trim()) {
      values.push(`%${input.query.trim().toLowerCase()}%`);
      const idx = values.length;
      clauses.push(
        `(
           lower(gc.commit_sha) LIKE $${idx}
           OR lower(gc.message) LIKE $${idx}
           OR lower(gc.author_name) LIKE $${idx}
           OR lower(coalesce(gc.branch, '')) LIKE $${idx}
           OR EXISTS (
             SELECT 1
             FROM kb_note_commit_links ncl_q
             JOIN kb_notes n_q ON n_q.id = ncl_q.note_id
             WHERE ncl_q.commit_id = gc.id
               AND ncl_q.user_id = gc.user_id
               AND lower(n_q.title) LIKE $${idx}
           )
         )`,
      );
    }

    const whereSql = clauses.join(' AND ');

    const countRes = await pool.query(
      `SELECT count(*)::int AS total
       FROM kb_git_commits gc
       WHERE ${whereSql}`,
      values,
    );
    const total = Number(countRes.rows[0]?.total || 0);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, total);

    const rowsRes = await pool.query(
      `SELECT gc.*,
              p.project_slug,
              p.display_name AS project_name,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'noteId', n.id,
                      'title', n.title,
                      'summary', n.summary,
                      'source', n.source,
                      'sourceChannel', n.source_channel,
                      'occurredAt', n.occurred_at,
                      'linkSource', ncl.link_source,
                      'matchedFiles', ncl.matched_files
                    )
                    ORDER BY n.occurred_at DESC
                  )
                  FROM kb_note_commit_links ncl
                  JOIN kb_notes n ON n.id = ncl.note_id
                  WHERE ncl.commit_id = gc.id AND ncl.user_id = gc.user_id
                ),
                '[]'::json
              ) AS linked_notes
       FROM kb_git_commits gc
       LEFT JOIN kb_projects p ON p.id = gc.project_id
       WHERE ${whereSql}
       ORDER BY gc.committed_at DESC, gc.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize],
    );

    const items: ProjectCommitItem[] = rowsRes.rows.map((row) => {
      const rawLinkedNotes: unknown[] = Array.isArray(row.linked_notes) ? row.linked_notes : [];
      const linkedNotes: LinkedCommitNoteSummary[] = rawLinkedNotes
        .filter((item: unknown): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item: Record<string, unknown>) => {
          const linkSource = (String(item.linkSource || 'manual') as CommitLinkSource);
          const matchedFiles = normalizeChangedFiles(item.matchedFiles);
          return {
            noteId: String(item.noteId || ''),
            title: String(item.title || ''),
            summary: String(item.summary || ''),
            source: String(item.source || ''),
            sourceChannel: String(item.sourceChannel || ''),
            occurredAt: toIsoTimestamp(item.occurredAt),
            linkSource,
            confidence: confidenceForLinkSource(linkSource, matchedFiles.length),
            matchedFiles,
          };
        });

      const commitSha = String(row.commit_sha);
      return {
        id: String(row.id),
        projectId: String(row.project_id),
        ...(row.project_slug ? { projectSlug: String(row.project_slug) } : {}),
        ...(row.project_name ? { projectName: String(row.project_name) } : {}),
        commitSha,
        shortSha: commitSha.slice(0, 7),
        message: String(row.message || ''),
        authorName: String(row.author_name || ''),
        authorEmail: String(row.author_email || ''),
        committedAt: toIsoTimestamp(row.committed_at),
        branch: row.branch ? String(row.branch) : null,
        changedFiles: normalizeChangedFiles(row.changed_files),
        htmlUrl: row.commit_url ? String(row.commit_url) : null,
        linkedNotes,
      };
    });

    return { items, pagination };
  }

  async linkNoteCommitManually(
    userId: string,
    noteId: string,
    commitId: string,
  ): Promise<LinkedCommitSummary> {
    if (!isUuid(noteId) || !isUuid(commitId)) {
      throw new NotFoundException('commit_or_note_not_found');
    }
    const pool = this.database.getPool();

    const [noteCheck, commitCheck] = await Promise.all([
      pool.query(`SELECT id, path, metadata FROM kb_notes WHERE id = $1 AND user_id = $2 LIMIT 1`, [noteId, userId]),
      pool.query(`SELECT * FROM kb_git_commits WHERE id = $1 AND user_id = $2 LIMIT 1`, [commitId, userId]),
    ]);

    const noteRow = noteCheck.rows[0];
    const commitRow = commitCheck.rows[0];
    if (!noteRow || !commitRow) {
      throw new NotFoundException('commit_or_note_not_found');
    }

    const commitFiles = normalizeChangedFiles(commitRow.changed_files);
    const noteFiles = extractNoteTouchedFiles({
      path: String(noteRow.path || ''),
      metadata: (noteRow.metadata || {}) as Record<string, unknown>,
    });
    const matchedFiles = intersectFiles(commitFiles, noteFiles);

    await this.upsertNoteCommitLink(pool, {
      userId,
      noteId,
      commitId,
      linkSource: 'manual',
      matchedFiles,
    });

    return linkedCommitFromRow({
      ...commitRow,
      link_source: 'manual',
      confidence: 100,
      matched_files: matchedFiles,
    });
  }

  async unlinkNoteCommit(
    userId: string,
    noteId: string,
    commitId: string,
  ): Promise<boolean> {
    if (!isUuid(noteId) || !isUuid(commitId)) return false;
    const pool = this.database.getPool();
    const res = await pool.query(
      `DELETE FROM kb_note_commit_links
       WHERE user_id = $1 AND note_id = $2 AND commit_id = $3`,
      [userId, noteId, commitId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}

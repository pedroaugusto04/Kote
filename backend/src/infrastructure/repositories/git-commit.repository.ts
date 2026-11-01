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
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
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
      const isGithub = Boolean(metadata?.repository || metadata?.eventType === 'code-review');
      entries.push({ sha, source: isGithub ? 'github_push' : 'ai_terminal' });
    }
  }

  return entries;
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
    if (tx && typeof (tx as PoolClient).query === 'function') {
      return tx as PoolClient;
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

    for (const rawCommit of commits) {
      const commitSha = normalizeSha(rawCommit.commitSha);
      if (!commitSha) continue;

      const changedFiles = normalizeChangedFiles(rawCommit.changedFiles);
      const committedAt = rawCommit.committedAt && !Number.isNaN(Date.parse(rawCommit.committedAt))
        ? new Date(rawCommit.committedAt).toISOString()
        : new Date().toISOString();

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
         RETURNING id, changed_files`,
        [
          crypto.randomUUID(),
          userId,
          scope.workspaceId,
          scope.projectId,
          commitSha,
          parentSha,
          rawCommit.branch ? String(rawCommit.branch).trim() : '',
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

      // 1. Explicit candidate session links from IDE tracker or GitHub push
      if (Array.isArray(rawCommit.candidateSessionLinks)) {
        for (const candidate of rawCommit.candidateSessionLinks) {
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
              linkSource: candidate.linkSource || 'session_files',
              matchedFiles: normalizeChangedFiles(candidate.matchedFiles),
            });
            linkedCount += 1;
          }
        }
      }

      // 2. Reconcile against existing project notes (deterministic SHA match or AI session file intersection)
      const candidatesRes = await pool.query(
        `SELECT n.id, n.path, n.source_channel, n.session_id, n.occurred_at, n.metadata,
                COALESCE(
                  (SELECT array_agg(nl.target) FROM kb_note_links nl WHERE nl.note_id = n.id AND nl.user_id = n.user_id),
                  ARRAY[]::text[]
                ) AS linked_targets
         FROM kb_notes n
         WHERE n.user_id = $1
           AND n.project_id = $2
           AND (
             lower(coalesce(n.metadata->>'headSha', n.metadata->>'commitHash', n.metadata->>'commit', '')) <> ''
             OR jsonb_typeof(n.metadata->'gitActivity'->'createdCommitShas') = 'array'
             OR (
               (n.session_id <> '' OR n.source_channel = 'ai-chat')
               AND n.occurred_at BETWEEN ($3::timestamptz - interval '24 hours') AND ($3::timestamptz + interval '15 minutes')
             )
           )`,
        [userId, scope.projectId, committedAt],
      );

      for (const noteRow of candidatesRes.rows) {
        const noteId = String(noteRow.id);
        const metadata = (noteRow.metadata || {}) as Record<string, unknown>;
        const deterministicShas = extractNoteDeterministicShas(metadata);

        const directMatch = deterministicShas.find(
          (entry) => commitSha.startsWith(entry.sha) || entry.sha.startsWith(commitSha),
        );

        const noteFiles = normalizeChangedFiles([
          ...extractNoteTouchedFiles({ path: String(noteRow.path || ''), metadata }),
          ...(Array.isArray(noteRow.linked_targets) ? noteRow.linked_targets : []),
        ]);
        const matchedFiles = intersectFiles(effectiveChangedFiles, noteFiles);

        if (directMatch) {
          await this.upsertNoteCommitLink(pool, {
            userId,
            noteId,
            commitId,
            linkSource: directMatch.source,
            matchedFiles: matchedFiles.length > 0 ? matchedFiles : effectiveChangedFiles,
          });
          linkedCount += 1;
        } else if (matchedFiles.length > 0) {
          await this.upsertNoteCommitLink(pool, {
            userId,
            noteId,
            commitId,
            linkSource: 'session_files',
            matchedFiles,
          });
          linkedCount += 1;
        }
      }
    }

    return { syncedCount, linkedCount };
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
    const gitActivity = (metadata.gitActivity && typeof metadata.gitActivity === 'object')
      ? (metadata.gitActivity as Record<string, unknown>)
      : null;

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
        const branch = typeof metadata.branch === 'string'
          ? metadata.branch
          : typeof gitActivity?.branch === 'string'
            ? gitActivity.branch
            : '';
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
            branch,
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

    // 2. If this is an AI session note with touchedFiles, also match recent commits in the project touching those files
    if (touchedFiles.length > 0 && (note.sessionId || note.sourceChannel === 'ai-chat')) {
      const occurredAt = note.occurredAt && !Number.isNaN(Date.parse(note.occurredAt))
        ? new Date(note.occurredAt).toISOString()
        : new Date().toISOString();

      const recentCommitsRes = await queryable.query(
        `SELECT id, changed_files
         FROM kb_git_commits
         WHERE user_id = $1
           AND project_id = $2
           AND committed_at BETWEEN ($3::timestamptz - interval '15 minutes') AND ($3::timestamptz + interval '24 hours')`,
        [userId, note.projectId, occurredAt],
      );

      for (const commitRow of recentCommitsRes.rows) {
        const commitFiles = normalizeChangedFiles(commitRow.changed_files);
        const matchedFiles = intersectFiles(commitFiles, touchedFiles);
        if (matchedFiles.length > 0) {
          await this.upsertNoteCommitLink(queryable, {
            userId,
            noteId: note.id,
            commitId: String(commitRow.id),
            linkSource: 'session_files',
            matchedFiles,
          });
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

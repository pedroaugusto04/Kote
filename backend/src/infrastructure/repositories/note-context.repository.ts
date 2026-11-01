import { Injectable } from '@nestjs/common';
import { eq, and, sql, desc, or, like } from 'drizzle-orm';
import { NoteContextRepository, type FindNotesByFileOptions } from '../../application/ports/notes/note-context.repository.js';
import { NoteRecord } from '../../application/models/repository-records.models.js';
import { PostgresDatabase } from '../persistence/database.js';
import { ContentObjectStorageService } from '../../application/services/content/content-object-storage.service.js';
import { notes, projects, noteLinks } from '../persistence/schema/index.js';
import { noteFromRow } from '../mappers/row.mappers.js';
import { SPECIAL_PROJECT_SLUGS, isSpecialProjectSlug } from '../../domain/projects.js';
import { normalizeFilePath } from '../../domain/utils/file-path.utils.js';

@Injectable()
export class PostgresNoteContextRepository implements NoteContextRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) {}

  private async hydrateMarkdown(note: NoteRecord): Promise<NoteRecord> {
    return this.contentObjectStorage.hydrateMarkdown(note);
  }

  async findNotesByFile(userId: string, filePath: string, options?: FindNotesByFileOptions): Promise<NoteRecord[]> {
    const db = this.database.getDb();
    const limit = options?.limit ?? 15;
    const commitHashes = (options?.commitHashes || []).map((hash) => hash.trim().toLowerCase()).filter(Boolean).slice(0, 20);

    const normalizedPath = normalizeFilePath(filePath);
    if (!normalizedPath) return [];

    const slashPath = '/' + normalizedPath;

    const pathCondition = or(
      eq(notes.path, normalizedPath),
      eq(notes.path, slashPath),
      like(notes.path, `%/${normalizedPath}`),
      sql`${normalizedPath} LIKE '%/' || ${notes.path}`,
      sql`EXISTS (
        SELECT 1 FROM ${noteLinks} nl
        WHERE nl.note_id = ${notes.id}
          AND nl.user_id = ${userId}
          AND (
            nl.target = ${normalizedPath}
            OR nl.target = ${slashPath}
            OR nl.target LIKE ${'%/' + normalizedPath}
            OR ${normalizedPath} LIKE '%/' || nl.target
          )
      )`,
    );

    const conditions = [
      eq(notes.userId, userId),
      pathCondition,
    ];

    if (options?.projectSlug) {
      const slug = options.projectSlug.trim().toLowerCase();
      if (isSpecialProjectSlug(slug)) {
        conditions.push(sql`(${projects.projectSlug} = ${SPECIAL_PROJECT_SLUGS.INBOX} OR ${projects.projectSlug} IS NULL OR ${notes.projectId} IS NULL)`);
      } else {
        conditions.push(sql`(${projects.projectSlug} = ${slug} OR ${projects.projectSlug} = ${SPECIAL_PROJECT_SLUGS.INBOX} OR ${projects.projectSlug} IS NULL OR ${notes.projectId} IS NULL)`);
      }
    }

    const noteCommitHash = sql<string>`lower(coalesce(
      ${notes.metadata}->>'commitHash',
      ${notes.metadata}->>'commit',
      ${notes.metadata}->>'headSha',
      ''
    ))`;

    const orderByClauses = [];
    if (commitHashes.length > 0) {
      const originCommitOrder = sql<number>`CASE WHEN (
        EXISTS (
          SELECT 1 FROM unnest(ARRAY[${sql.join(commitHashes.map((hash) => sql`${hash}`), sql`, `)}]) AS selected(hash)
          WHERE ${noteCommitHash} <> ''
            AND (
              ${noteCommitHash} LIKE selected.hash || '%'
              OR selected.hash LIKE ${noteCommitHash} || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM kb_note_commit_links ncl
          JOIN kb_git_commits gc ON gc.id = ncl.commit_id
          JOIN unnest(ARRAY[${sql.join(commitHashes.map((hash) => sql`${hash}`), sql`, `)}]) AS selected(hash)
            ON (gc.commit_sha LIKE selected.hash || '%' OR selected.hash LIKE gc.commit_sha || '%')
          WHERE ncl.note_id = ${notes.id} AND ncl.user_id = ${notes.userId}
        )
      ) THEN 1 ELSE 0 END`;
      orderByClauses.push(desc(originCommitOrder));
    }
    orderByClauses.push(desc(notes.occurredAt));

    const result = await db
      .select({
        id: notes.id,
        userId: notes.userId,
        path: notes.path,
        title: notes.title,
        projectId: notes.projectId,
        workspaceId: notes.workspaceId,
        projectSlug: projects.projectSlug,
        folderId: notes.folderId,
        status: notes.status,
        tags: notes.tags,
        occurredAt: notes.occurredAt,
        sourceChannel: notes.sourceChannel,
        source: notes.source,
        summary: notes.summary,
        markdownStorageKey: notes.markdownStorageKey,
        metadata: notes.metadata,
        sessionId: notes.sessionId,
        reminderAt: notes.reminderAt,
        isPinned: notes.isPinned,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
        linkedCommits: sql<unknown[]>`COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', gc.id,
                'commit_sha', gc.commit_sha,
                'short_sha', left(gc.commit_sha, 7),
                'message', gc.message,
                'author_name', gc.author_name,
                'committed_at', gc.committed_at,
                'branch', nullif(gc.branch, ''),
                'html_url', nullif(gc.commit_url, ''),
                'link_source', ncl.link_source,
                'matched_files', ncl.matched_files
              )
              ORDER BY gc.committed_at DESC
            )
            FROM kb_note_commit_links ncl
            JOIN kb_git_commits gc ON gc.id = ncl.commit_id
            WHERE ncl.note_id = ${notes.id} AND ncl.user_id = ${notes.userId}
          ),
          '[]'::json
        )`.as('linked_commits'),
      })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .where(and(...conditions))
      .orderBy(...orderByClauses)
      .limit(limit);

    const records = result.map(noteFromRow);
    
    return Promise.all(records.map(note => this.hydrateMarkdown(note)));
  }
}

import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { ContentRepository } from '../../application/ports/content.repository.js';
import type { NoteRecord, SaveAttachmentInput, SaveNoteInput, SaveWorkspaceInput } from '../../application/models/repository-records.models.js';
import { attachmentFromRow, noteFromRow, projectFromRow, workspaceFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';

@Injectable()
export class PostgresContentRepository extends ContentRepository {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) {
    super();
  }

  private async hydrateMarkdown(note: NoteRecord): Promise<NoteRecord> {
    return this.contentObjectStorage.hydrateMarkdown(note);
  }

  async listWorkspaces(userId: string) {
    const result = await this.database.getPool().query('select * from kb_workspaces where user_id = $1 order by workspace_slug', [userId]);
    return result.rows.map(workspaceFromRow);
  }

  async upsertWorkspace(userId: string, input: SaveWorkspaceInput) {
    const result = await this.database.getPool().query(
      `insert into kb_workspaces (id, user_id, workspace_slug, display_name, whatsapp_group_jid, telegram_chat_id)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, workspace_slug)
       do update set
         display_name = excluded.display_name,
         whatsapp_group_jid = excluded.whatsapp_group_jid,
         telegram_chat_id = excluded.telegram_chat_id,
         updated_at = now()
       returning *`,
      [
        crypto.randomUUID(),
        userId,
        input.workspaceSlug,
        input.displayName,
        input.whatsappGroupJid,
        input.telegramChatId,
      ],
    );
    return workspaceFromRow(result.rows[0]);
  }

  async listProjects(userId: string) {
    const result = await this.database.getPool().query(
      `SELECT p.*,
         COALESCE((SELECT jsonb_agg(alias) FROM kb_project_aliases WHERE project_id = p.id), '[]'::jsonb) as aliases,
         COALESCE((SELECT jsonb_agg(tag) FROM kb_project_default_tags WHERE project_id = p.id), '[]'::jsonb) as default_tags,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('external_repo_id', external_repo_id, 'repo_full_name', repo_full_name)) FROM kb_project_repositories WHERE project_id = p.id), '[]'::jsonb) as repositories
       FROM kb_projects p
       WHERE p.user_id = $1 AND p.enabled = true
       ORDER BY p.project_slug`,
      [userId],
    );
    return result.rows.map(projectFromRow);
  }

  async getProjectBySlug(userId: string, projectSlug: string) {
    const result = await this.database.getPool().query(
      `SELECT p.*,
         COALESCE((SELECT jsonb_agg(alias) FROM kb_project_aliases WHERE project_id = p.id), '[]'::jsonb) as aliases,
         COALESCE((SELECT jsonb_agg(tag) FROM kb_project_default_tags WHERE project_id = p.id), '[]'::jsonb) as default_tags,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('external_repo_id', external_repo_id, 'repo_full_name', repo_full_name)) FROM kb_project_repositories WHERE project_id = p.id), '[]'::jsonb) as repositories
       FROM kb_projects p
       WHERE p.user_id = $1 AND p.project_slug = $2
       LIMIT 1`,
      [userId, projectSlug],
    );
    return result.rows[0] ? projectFromRow(result.rows[0]) : null;
  }

  async upsertProject(userId: string, input: {
    projectSlug: string;
    displayName: string;
    workspaceSlug: string;
    repositories: { externalRepoId: string; repoFullName: string }[];
    aliases: string[];
    defaultTags: string[];
    enabled: boolean;
  }) {
    const client = await this.database.getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `insert into kb_projects (id, user_id, project_slug, display_name, workspace_slug, enabled)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id, project_slug)
         do update set
           display_name = excluded.display_name,
           workspace_slug = excluded.workspace_slug,
           enabled = excluded.enabled,
           updated_at = now()
         returning *`,
        [
          crypto.randomUUID(),
          userId,
          input.projectSlug,
          input.displayName,
          input.workspaceSlug,
          input.enabled,
        ],
      );
      const project = result.rows[0];
      const { aliases, defaultTags, repositories } = input;

      await client.query('DELETE FROM kb_project_aliases WHERE project_id = $1', [project.id]);
      if (aliases.length > 0) {
        for (const alias of aliases) {
          await client.query('INSERT INTO kb_project_aliases (project_id, alias) VALUES ($1, $2)', [project.id, alias]);
        }
      }

      await client.query('DELETE FROM kb_project_default_tags WHERE project_id = $1', [project.id]);
      if (defaultTags.length > 0) {
        for (const tag of defaultTags) {
          await client.query('INSERT INTO kb_project_default_tags (project_id, tag) VALUES ($1, $2)', [project.id, tag]);
        }
      }

      await client.query('DELETE FROM kb_project_repositories WHERE project_id = $1', [project.id]);
      if (repositories.length > 0) {
        for (const repo of repositories) {
          await client.query('INSERT INTO kb_project_repositories (project_id, external_repo_id, repo_full_name) VALUES ($1, $2, $3)', [
            project.id,
            repo.externalRepoId || '0',
            repo.repoFullName,
          ]);
        }
      }

      await client.query('COMMIT');
      return projectFromRow({ 
        ...project, 
        aliases, 
        default_tags: defaultTags, 
        repositories: repositories.map(r => ({ external_repo_id: r.externalRepoId, repo_full_name: r.repoFullName })) 
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteProject(userId: string, projectSlug: string) {
    const result = await this.database.getPool().query('delete from kb_projects where user_id = $1 and project_slug = $2', [userId, projectSlug]);
    return (result.rowCount || 0) > 0;
  }

  async listNotes(userId: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 order by occurred_at desc, title asc', [userId]);
    return result.rows.map(noteFromRow);
  }

  async getNoteById(userId: string, id: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 and id = $2 limit 1', [userId, id]);
    return result.rows[0] ? this.hydrateMarkdown(noteFromRow(result.rows[0])) : null;
  }

  async getNoteByPath(userId: string, path: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 and path = $2 limit 1', [userId, path]);
    return result.rows[0] ? noteFromRow(result.rows[0]) : null;
  }

  async findReminderBySourceNotePath(userId: string, sourceNotePath: string) {
    const result = await this.database.getPool().query(
      `select * from kb_notes
       where user_id = $1 and type = 'reminder' and metadata ->> 'sourceNotePath' = $2
       order by occurred_at desc
       limit 1`,
      [userId, sourceNotePath],
    );
    return result.rows[0] ? this.hydrateMarkdown(noteFromRow(result.rows[0])) : null;
  }

  async upsertNote(userId: string, input: SaveNoteInput) {
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, input);
    const result = await this.database.getPool().query(
      `insert into kb_notes (
         id, user_id, path, type, title, project_slug, workspace_slug, status, tags, occurred_at,
         source_channel, summary, markdown_storage_key, frontmatter, metadata, origin, source, links
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16, $17, $18::jsonb)
       on conflict (user_id, path)
       do update set
         type = excluded.type,
         title = excluded.title,
         project_slug = excluded.project_slug,
         workspace_slug = excluded.workspace_slug,
         status = excluded.status,
         tags = excluded.tags,
         occurred_at = excluded.occurred_at,
         source_channel = excluded.source_channel,
         summary = excluded.summary,
         markdown_storage_key = excluded.markdown_storage_key,
         frontmatter = excluded.frontmatter,
         metadata = excluded.metadata,
         origin = excluded.origin,
         source = excluded.source,
         links = excluded.links,
         updated_at = now()
       returning *`,
      [
        input.id || crypto.randomUUID(),
        userId,
        input.path,
        input.type,
        input.title,
        input.projectSlug,
        input.workspaceSlug,
        input.status,
        JSON.stringify(input.tags),
        input.occurredAt,
        input.sourceChannel,
        input.summary,
        markdownStorageKey,
        JSON.stringify(input.frontmatter),
        JSON.stringify(input.metadata),
        input.origin,
        input.source,
        JSON.stringify(input.links),
      ],
    );
    return { ...noteFromRow(result.rows[0]), markdown: input.markdown };
  }

  async deleteNote(userId: string, id: string) {
    const noteResult = await this.database.getPool().query('select markdown_storage_key from kb_notes where user_id = $1 and id = $2 limit 1', [userId, id]);
    const attachmentResult = await this.database.getPool().query('select storage_key from kb_attachments where user_id = $1 and note_id = $2', [userId, id]);
    const result = await this.database.getPool().query('delete from kb_notes where user_id = $1 and id = $2', [userId, id]);
    if ((result.rowCount || 0) === 0) return false;
    const keys = [
      noteResult.rows[0]?.markdown_storage_key || '',
      ...attachmentResult.rows.map((row) => row.storage_key || ''),
    ];
    await this.contentObjectStorage.deleteObjects(keys);
    return true;
  }

  async saveAttachment(userId: string, input: SaveAttachmentInput) {
    const attachmentId = input.id || crypto.randomUUID();
    const noteResult = await this.database.getPool().query('select workspace_slug from kb_notes where user_id = $1 and id = $2 limit 1', [userId, input.noteId]);
    const workspaceSlug = noteResult.rows[0]?.workspace_slug || 'default';
    const storageKey = await this.contentObjectStorage.saveAttachmentData(userId, workspaceSlug, input);
    const result = await this.database.getPool().query(
      `insert into kb_attachments (id, user_id, note_id, file_name, mime_type, size_bytes, storage_key, checksum_sha256, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       returning *`,
      [
        attachmentId,
        userId,
        input.noteId,
        input.fileName,
        input.mimeType,
        input.sizeBytes,
        storageKey,
        input.checksumSha256,
        JSON.stringify(input.metadata || {}),
      ],
    );
    return attachmentFromRow(result.rows[0]);
  }

  async listAttachments(userId: string, noteId: string) {
    const result = await this.database.getPool().query('select * from kb_attachments where user_id = $1 and note_id = $2 order by created_at', [userId, noteId]);
    return result.rows.map(attachmentFromRow);
  }
}

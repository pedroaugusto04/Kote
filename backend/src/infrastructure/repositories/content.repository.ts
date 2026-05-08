import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { ListNotesInput } from '../../application/models/note-list.models.js';
import type { ListProjectsInput } from '../../application/models/project-list.models.js';
import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { ContentRepository } from '../../application/ports/content.repository.js';
import type {
  NoteRecord,
  RepositoryRecord,
  SaveAttachmentInput,
  SaveNoteInput,
  SaveProjectFolderInput,
  SaveWorkspaceInput,
} from '../../application/models/repository-records.models.js';
import { buildPaginationMeta } from '../../contracts/pagination.js';
import { noteSummary } from '../mappers/content-query.mappers.js';
import { attachmentFromRow, noteFromRow, projectFolderFromRow, projectFromRow, repositoryFromRow, workspaceFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';

const PROJECT_WITH_METADATA_SELECT = `SELECT p.*,
  COALESCE((SELECT jsonb_agg(alias) FROM kb_project_aliases WHERE project_id = p.id), '[]'::jsonb) as aliases,
  COALESCE((SELECT jsonb_agg(tag) FROM kb_project_default_tags WHERE project_id = p.id), '[]'::jsonb) as default_tags,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', r.id,
    'workspace_slug', r.workspace_slug,
    'external_id', r.external_id,
    'full_name', r.full_name,
    'html_url', r.html_url,
    'description', r.description,
    'default_branch', r.default_branch,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  )) FROM kb_project_repositories pr JOIN kb_repositories r ON r.id = pr.repository_id WHERE pr.project_id = p.id), '[]'::jsonb) as repositories
FROM kb_projects p`;

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

  async listRepositories(userId: string, workspaceSlug: string) {
    const result = await this.database.getPool().query(
      `SELECT r.* FROM kb_repositories r
       JOIN kb_workspaces w ON w.workspace_slug = r.workspace_slug
       WHERE w.user_id = $1 AND r.workspace_slug = $2
       ORDER BY r.full_name`,
      [userId, workspaceSlug]
    );
    return result.rows.map(repositoryFromRow);
  }

  async upsertRepository(input: Omit<RepositoryRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const result = await this.database.getPool().query(
      `INSERT INTO kb_repositories (id, workspace_slug, external_id, full_name, html_url, description, default_branch)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (workspace_slug, external_id)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         html_url = EXCLUDED.html_url,
         description = EXCLUDED.description,
         default_branch = EXCLUDED.default_branch,
         updated_at = now()
       RETURNING *`,
      [
        input.id || crypto.randomUUID(),
        input.workspaceSlug,
        input.externalId,
        input.fullName,
        input.htmlUrl,
        input.description,
        input.defaultBranch,
      ]
    );
    return repositoryFromRow(result.rows[0]);
  }

  async listProjects(userId: string) {
    const result = await this.database.getPool().query(
      `${PROJECT_WITH_METADATA_SELECT}
       WHERE p.user_id = $1 AND p.enabled = true
       ORDER BY p.project_slug`,
      [userId],
    );
    return result.rows.map(projectFromRow);
  }

  async listProjectsPage(userId: string, input: ListProjectsInput) {
    const totalResult = await this.database.getPool().query(
      'select count(*)::int as total from kb_projects where user_id = $1 and enabled = true',
      [userId],
    );
    const total = Number(totalResult.rows[0]?.total || 0);
    const selectedPage = input.selectedSlug ? await this.resolveProjectPage(userId, input.selectedSlug, input.pageSize) : input.page;
    const pagination = buildPaginationMeta({ page: selectedPage, pageSize: input.pageSize }, total);
    const offset = (pagination.page - 1) * pagination.pageSize;
    const result = await this.database.getPool().query(
      `${PROJECT_WITH_METADATA_SELECT}
       WHERE p.user_id = $1 AND p.enabled = true
       ORDER BY p.project_slug
       LIMIT $2 OFFSET $3`,
      [userId, pagination.pageSize, offset],
    );

    return { items: result.rows.map(projectFromRow), pagination };
  }

  async getProjectBySlug(userId: string, projectSlug: string) {
    const result = await this.database.getPool().query(
      `${PROJECT_WITH_METADATA_SELECT}
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
    repositories: RepositoryRecord[];
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
          await client.query('INSERT INTO kb_project_repositories (project_id, repository_id) VALUES ($1, $2)', [
            project.id,
            repo.id,
          ]);
        }
      }

      await client.query('COMMIT');
      return projectFromRow({ 
        ...project, 
        aliases, 
        default_tags: defaultTags, 
        repositories
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

  async listProjectFolders(userId: string, projectSlug: string) {
    const result = await this.database.getPool().query(
      `select * from kb_project_folders
       where user_id = $1 and project_slug = $2
       order by full_slug_path`,
      [userId, projectSlug],
    );
    return result.rows.map(projectFolderFromRow);
  }

  async getProjectFolderById(userId: string, projectSlug: string, folderId: string) {
    const result = await this.database.getPool().query(
      `select * from kb_project_folders
       where user_id = $1 and project_slug = $2 and id = $3
       limit 1`,
      [userId, projectSlug, folderId],
    );
    return result.rows[0] ? projectFolderFromRow(result.rows[0]) : null;
  }

  async upsertProjectFolder(userId: string, input: SaveProjectFolderInput) {
    const result = await this.database.getPool().query(
      `insert into kb_project_folders (
         id, user_id, workspace_slug, project_slug, parent_folder_id, display_name, folder_slug, full_slug_path
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id)
       do update set
         workspace_slug = excluded.workspace_slug,
         project_slug = excluded.project_slug,
         parent_folder_id = excluded.parent_folder_id,
         display_name = excluded.display_name,
         folder_slug = excluded.folder_slug,
         full_slug_path = excluded.full_slug_path,
         updated_at = now()
       returning *`,
      [
        input.id || crypto.randomUUID(),
        userId,
        input.workspaceSlug,
        input.projectSlug,
        input.parentFolderId,
        input.displayName,
        input.folderSlug,
        input.fullSlugPath,
      ],
    );
    return projectFolderFromRow(result.rows[0]);
  }

  async deleteProjectFolder(userId: string, projectSlug: string, folderId: string) {
    const result = await this.database.getPool().query(
      'delete from kb_project_folders where user_id = $1 and project_slug = $2 and id = $3',
      [userId, projectSlug, folderId],
    );
    return (result.rowCount || 0) > 0;
  }

  async listNotes(userId: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 order by occurred_at desc, title asc', [userId]);
    return result.rows.map(noteFromRow);
  }

  async listNotesPage(userId: string, input: ListNotesInput) {
    const clauses = ['user_id = $1'];
    const values: unknown[] = [userId];

    if (input.workspaceSlug) {
      values.push(input.workspaceSlug);
      clauses.push(`workspace_slug = $${values.length}`);
    }
    if (input.projectSlug) {
      values.push(input.projectSlug);
      clauses.push(`project_slug = $${values.length}`);
    }
    if (input.folderId) {
      values.push(input.folderId);
      clauses.push(`folder_id = $${values.length}`);
    } else if (input.rootOnly) {
      clauses.push('folder_id is null');
    }

    const where = clauses.join(' and ');
    const totalResult = await this.database.getPool().query(`select count(*)::int as total from kb_notes where ${where}`, values);
    const total = Number(totalResult.rows[0]?.total || 0);
    const selectedPage = input.selectedId ? await this.resolveNotePage(input, where, values) : input.page;
    const pagination = buildPaginationMeta({ page: selectedPage, pageSize: input.pageSize }, total);
    const result = await this.database.getPool().query(
      `select * from kb_notes
       where ${where}
       order by occurred_at desc, title asc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize],
    );

    return { items: result.rows.map((row) => noteSummary(noteFromRow(row))), pagination };
  }

  async getNoteById(userId: string, id: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 and id = $2 limit 1', [userId, id]);
    return result.rows[0] ? this.hydrateMarkdown(noteFromRow(result.rows[0])) : null;
  }

  async getNoteByPath(userId: string, path: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 and path = $2 limit 1', [userId, path]);
    return result.rows[0] ? noteFromRow(result.rows[0]) : null;
  }

  async upsertNote(userId: string, input: SaveNoteInput) {
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, input);
    const result = await this.database.getPool().query(
      `insert into kb_notes (
         id, user_id, path, type, title, project_slug, workspace_slug, folder_id, status, tags, occurred_at,
         source_channel, summary, markdown_storage_key, frontmatter, metadata, origin, source, links
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17, $18, $19::jsonb)
       on conflict (user_id, path)
       do update set
         type = excluded.type,
         title = excluded.title,
         project_slug = excluded.project_slug,
         workspace_slug = excluded.workspace_slug,
         folder_id = excluded.folder_id,
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
        input.folderId,
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

  async updateNote(userId: string, input: SaveNoteInput) {
    const existing = await this.getNoteById(userId, String(input.id || ''));
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, input);
    const result = await this.database.getPool().query(
      `update kb_notes
       set path = $3,
           type = $4,
           title = $5,
           project_slug = $6,
           workspace_slug = $7,
           folder_id = $8,
           status = $9,
           tags = $10::jsonb,
           occurred_at = $11,
           source_channel = $12,
           summary = $13,
           markdown_storage_key = $14,
           frontmatter = $15::jsonb,
           metadata = $16::jsonb,
           origin = $17,
           source = $18,
           links = $19::jsonb,
           updated_at = now()
       where user_id = $1 and id = $2
       returning *`,
      [
        userId,
        input.id,
        input.path,
        input.type,
        input.title,
        input.projectSlug,
        input.workspaceSlug,
        input.folderId,
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
    if (existing?.markdownStorageKey && existing.markdownStorageKey !== markdownStorageKey) {
      await this.contentObjectStorage.deleteObjects([existing.markdownStorageKey]);
    }
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

  private async resolveProjectPage(userId: string, selectedSlug: string, pageSize: number) {
    const result = await this.database.getPool().query(
      `select count(*)::int as idx
       from kb_projects
       where user_id = $1
         and enabled = true
         and project_slug <= $2`,
      [userId, selectedSlug],
    );
    const index = Number(result.rows[0]?.idx || 0);
    return index > 0 ? Math.ceil(index / pageSize) : 1;
  }

  private async resolveNotePage(input: ListNotesInput, where: string, values: unknown[]) {
    const selected = await this.database.getPool().query(
      `select occurred_at, title
       from kb_notes
       where ${where} and id = $${values.length + 1}
       limit 1`,
      [...values, input.selectedId],
    );
    const note = selected.rows[0];
    if (!note) return input.page;

    const result = await this.database.getPool().query(
      `select count(*)::int as idx
       from kb_notes
       where ${where}
         and (
           occurred_at > $${values.length + 1}
           or (occurred_at = $${values.length + 1} and title <= $${values.length + 2})
         )`,
      [...values, note.occurred_at, note.title],
    );
    const index = Number(result.rows[0]?.idx || 0);
    return index > 0 ? Math.ceil(index / input.pageSize) : 1;
  }
}

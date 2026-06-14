import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { calculateAttachmentSize } from '../../domain/strings.js';

import type { ListNotesInput } from '../../application/models/note-list.models.js';
import type { ListProjectKnowledgeMapInput } from '../../application/models/project-knowledge-map.models.js';
import type {
  ListProjectTimelineInput,
  ProjectTimelineFilterCategory,
} from '../../application/models/project-timeline.models.js';
import type { ListProjectsInput } from '../../application/models/project-list.models.js';
import { ContentObjectStorageService } from '../../application/services/content-object-storage.service.js';
import { ContentRepository } from '../../application/ports/notes/content.repository.js';
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
import { INSERT_ATTACHMENT_SQL } from './content/attachment.queries.js';
import { UPSERT_PROJECT_FOLDER_SQL } from './content/folder.queries.js';
import { buildNoteMutableValues } from './content/note.queries.js';
import { PROJECT_WITH_METADATA_SELECT_SQL } from './content/project-workspace.queries.js';

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
      `insert into kb_workspaces (id, user_id, workspace_slug, display_name, whatsapp_chat_jid, telegram_chat_id)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, workspace_slug)
       do update set
         display_name = excluded.display_name,
         whatsapp_chat_jid = excluded.whatsapp_chat_jid,
         telegram_chat_id = excluded.telegram_chat_id,
         updated_at = now()
       returning *`,
      [
        crypto.randomUUID(),
        userId,
        input.workspaceSlug,
        input.displayName,
        input.whatsappChatJid,
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
      `${PROJECT_WITH_METADATA_SELECT_SQL}
       WHERE p.user_id = $1 AND p.enabled = true
       ORDER BY p.is_favorite DESC, p.project_slug`,
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
      `${PROJECT_WITH_METADATA_SELECT_SQL}
       WHERE p.user_id = $1 AND p.enabled = true
       ORDER BY p.is_favorite DESC, p.project_slug
       LIMIT $2 OFFSET $3`,
      [userId, pagination.pageSize, offset],
    );

    return { items: result.rows.map(projectFromRow), pagination };
  }

  async getProjectBySlug(userId: string, projectSlug: string) {
    const result = await this.database.getPool().query(
      `${PROJECT_WITH_METADATA_SELECT_SQL}
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
    defaultTags: string[];
    enabled: boolean;
    favorite?: boolean;
  }) {
    const client = await this.database.getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `insert into kb_projects (id, user_id, project_slug, display_name, workspace_slug, enabled, is_favorite)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (user_id, project_slug)
         do update set
           display_name = excluded.display_name,
           workspace_slug = excluded.workspace_slug,
           enabled = excluded.enabled,
           is_favorite = excluded.is_favorite,
           updated_at = now()
         returning *`,
        [
          crypto.randomUUID(),
          userId,
          input.projectSlug,
          input.displayName,
          input.workspaceSlug,
          input.enabled,
          input.favorite ?? false,
        ],
      );
      const project = result.rows[0];
      const { defaultTags, repositories } = input;

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

  async setProjectFavorite(userId: string, projectSlug: string, favorite: boolean) {
    const result = await this.database.getPool().query(
      `UPDATE kb_projects SET is_favorite = $3, updated_at = now() WHERE user_id = $1 AND project_slug = $2 RETURNING *`,
      [userId, projectSlug, favorite],
    );
    return result.rows[0] ? projectFromRow(result.rows[0]) : null;
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
      UPSERT_PROJECT_FOLDER_SQL,
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

  async updateProjectFolderTree(userId: string, input: { folders: SaveProjectFolderInput[]; notes: SaveNoteInput[] }) {
    const noteWrites = await Promise.all(input.notes.map(async (note) => ({
      note,
      previousMarkdownStorageKey: note.markdownStorageKey || '',
      markdownStorageKey: await this.contentObjectStorage.saveNoteMarkdown(userId, { ...note, markdownStorageKey: undefined }),
    })));
    const client = await this.database.getPool().connect();
    try {
      await client.query('BEGIN');
      for (const folder of input.folders) {
        await this.upsertProjectFolderWithClient(client, userId, folder);
      }
      for (const write of noteWrites) {
        await this.updateNoteWithClient(client, userId, write.note, write.markdownStorageKey);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.contentObjectStorage.deleteObjects(
      noteWrites
        .filter((write) => write.previousMarkdownStorageKey && write.previousMarkdownStorageKey !== write.markdownStorageKey)
        .map((write) => write.previousMarkdownStorageKey),
    );
  }

  async deleteProjectFolder(userId: string, projectSlug: string, folderId: string) {
    const result = await this.database.getPool().query(
      'delete from kb_project_folders where user_id = $1 and project_slug = $2 and id = $3',
      [userId, projectSlug, folderId],
    );
    return (result.rowCount || 0) > 0;
  }

  async listNotes(userId: string) {
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where n.user_id = $1
       group by n.id
       order by n.is_pinned desc, n.occurred_at desc, n.title asc`,
      [userId],
    );
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
    if (input.status) {
      if (input.status === 'open') {
        clauses.push(`lower(status) not in ('resolved', 'archived')`);
      } else {
        values.push(input.status);
        clauses.push(`lower(status) = $${values.length}`);
      }
    }
    if (input.folderId) {
      values.push(input.folderId);
      clauses.push(`folder_id = $${values.length}`);
    }

    const where = clauses.join(' and ');
    const dataWhere = where
      .replace(/\buser_id\b/g, 'n.user_id')
      .replace(/\bworkspace_slug\b/g, 'n.workspace_slug')
      .replace(/\bproject_slug\b/g, 'n.project_slug')
      .replace(/\bfolder_id\b/g, 'n.folder_id');
    const totalResult = await this.database.getPool().query(`select count(*)::int as total from kb_notes where ${where}`, values);
    const total = Number(totalResult.rows[0]?.total || 0);
    const selectedPage = input.selectedId ? await this.resolveNotePage(input, where, values) : input.page;
    const pagination = buildPaginationMeta({ page: selectedPage, pageSize: input.pageSize }, total);
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where ${dataWhere}
       group by n.id
       order by n.is_pinned desc, n.occurred_at desc, n.title asc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize],
    );

    return { items: result.rows.map((row) => noteSummary(noteFromRow(row))), pagination };
  }

  async listProjectTimeline(userId: string, input: ListProjectTimelineInput) {
    const values: unknown[] = [userId];
    const clauses = ['user_id = $1'];
    if (input.projectSlug) {
      values.push(input.projectSlug);
      clauses.push(`project_slug = $${values.length}`);
    }
    appendTimelineFolderClause(clauses, values, input.folderId, input.folderIds);
    appendTimelineCategoryClause(clauses, input.category);
    if (input.status) {
      if (input.status === 'open') {
        clauses.push(`lower(status) not in ('resolved', 'archived')`);
      } else {
        values.push(input.status);
        clauses.push(`lower(status) = $${values.length}`);
      }
    }
    const where = clauses.join(' and ');
    const dataWhere = where
      .replace(/\buser_id\b/g, 'n.user_id')
      .replace(/\bproject_slug\b/g, 'n.project_slug')
      .replace(/\bfolder_id\b/g, 'n.folder_id')
      .replace(/\btype\b/g, 'n.type')
      .replace(/\bsource_channel\b/g, 'n.source_channel')
      .replace(/\bsource\b/g, 'n.source')
      .replace(/\bstatus\b/g, 'n.status')
      .replace(/\bmetadata\b/g, 'n.metadata');
    const totalResult = await this.database.getPool().query(`select count(*)::int as total from kb_notes where ${where}`, values);
    const total = Number(totalResult.rows[0]?.total || 0);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, total);
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where ${dataWhere}
       group by n.id
       order by n.is_pinned desc, n.occurred_at desc, n.title asc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pagination.pageSize, (pagination.page - 1) * pagination.pageSize],
    );

    return {
      items: result.rows.map((row) => projectTimelineItem(noteFromRow(row))),
      pagination,
    };
  }

  async listProjectKnowledgeMapItems(userId: string, input: ListProjectKnowledgeMapInput) {
    const values: unknown[] = [userId, input.projectSlug];
    const clauses = ['user_id = $1', 'project_slug = $2'];
    appendTimelineFolderClause(clauses, values, input.folderId, input.folderIds);
    appendTimelineCategoryClause(clauses, input.category);
    const where = clauses.join(' and ');
    const dataWhere = where
      .replace(/\buser_id\b/g, 'n.user_id')
      .replace(/\bproject_slug\b/g, 'n.project_slug')
      .replace(/\bfolder_id\b/g, 'n.folder_id')
      .replace(/\btype\b/g, 'n.type')
      .replace(/\bsource_channel\b/g, 'n.source_channel')
      .replace(/\bsource\b/g, 'n.source')
      .replace(/\bmetadata\b/g, 'n.metadata');
    const result = await this.database.getPool().query(
      `select n.*, count(a.id)::int as attachment_count
       from kb_notes n
       left join kb_attachments a on a.user_id = n.user_id and a.note_id = n.id
       where ${dataWhere}
       group by n.id
       order by n.is_pinned desc, n.occurred_at desc, n.title asc
       limit $${values.length + 1}`,
      [...values, input.limit],
    );

    return result.rows.map((row) => noteFromRow(row));
  }

  async getNoteById(userId: string, id: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 and id = $2 limit 1', [userId, id]);
    return result.rows[0] ? this.hydrateMarkdown(noteFromRow(result.rows[0])) : null;
  }

  async getNotesByIds(userId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const result = await this.database.getPool().query(
      'select * from kb_notes where user_id = $1 and id = any($2)',
      [userId, ids],
    );
    const notes = result.rows.map(noteFromRow);
    return Promise.all(notes.map((n) => this.hydrateMarkdown(n)));
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
      [input.id || crypto.randomUUID(), userId, ...buildNoteMutableValues(input, markdownStorageKey)],
    );
    return { ...noteFromRow(result.rows[0]), markdown: input.markdown };
  }

  async updateNote(userId: string, input: SaveNoteInput) {
    const existing = await this.getNoteById(userId, String(input.id || ''));
    const markdownStorageKey = await this.contentObjectStorage.saveNoteMarkdown(userId, input);
    const result = await this.updateNoteWithClient(this.database.getPool(), userId, input, markdownStorageKey);
    if (existing?.markdownStorageKey && existing.markdownStorageKey !== markdownStorageKey) {
      await this.contentObjectStorage.deleteObjects([existing.markdownStorageKey]);
    }
    return { ...noteFromRow(result.rows[0]), markdown: input.markdown };
  }

  async updateReminderStatus(userId: string, id: string, status: string) {
    const result = await this.database.getPool().query(
      `update kb_notes
       set status = $3,
           updated_at = now()
       where user_id = $1 and id = $2
         and (
           coalesce(metadata->>'reminderDate', '') <> ''
           or coalesce(metadata->>'reminderAt', '') <> ''
         )
       returning *`,
      [userId, id, status],
    );
    return result.rows[0] ? noteFromRow(result.rows[0]) : null;
  }

  private async upsertProjectFolderWithClient(client: PoolClient, userId: string, input: SaveProjectFolderInput) {
    return client.query(
      UPSERT_PROJECT_FOLDER_SQL,
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
  }

  private async updateNoteWithClient(client: Pick<PoolClient, 'query'>, userId: string, input: SaveNoteInput, markdownStorageKey: string) {
    return client.query(
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
      [userId, input.id, ...buildNoteMutableValues(input, markdownStorageKey)],
    );
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
    const sizeBytes = calculateAttachmentSize(input.sizeBytes, input.dataBase64);
    const result = await this.database.getPool().query(
      INSERT_ATTACHMENT_SQL,
      [
        attachmentId,
        userId,
        input.noteId,
        input.fileName,
        input.mimeType,
        sizeBytes,
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
         and (
           is_favorite > (select is_favorite from kb_projects where user_id = $1 and project_slug = $2)
           or (is_favorite = (select is_favorite from kb_projects where user_id = $1 and project_slug = $2) and project_slug <= $2)
         )`,
      [userId, selectedSlug],
    );
    const index = Number(result.rows[0]?.idx || 0);
    return index > 0 ? Math.ceil(index / pageSize) : 1;
  }

  private async resolveNotePage(input: ListNotesInput, where: string, values: unknown[]) {
    const selected = await this.database.getPool().query(
      `select occurred_at, title, is_pinned
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
           (is_pinned and not $${values.length + 1}::boolean)
           or (is_pinned = $${values.length + 1}::boolean and occurred_at > $${values.length + 2})
           or (is_pinned = $${values.length + 1}::boolean and occurred_at = $${values.length + 2} and title <= $${values.length + 3})
         )`,
      [...values, note.is_pinned, note.occurred_at, note.title],
    );
    const index = Number(result.rows[0]?.idx || 0);
    return index > 0 ? Math.ceil(index / input.pageSize) : 1;
  }

  async setNotePinned(userId: string, id: string, pinned: boolean) {
    const result = await this.database.getPool().query(
      `update kb_notes
       set is_pinned = $3,
           updated_at = now()
       where user_id = $1 and id = $2
       returning *`,
      [userId, id, pinned],
    );
    return result.rows[0] ? noteFromRow(result.rows[0]) : null;
  }
}

function projectTimelineItem(record: NoteRecord) {
  const summary = noteSummary(record);
  return {
    ...summary,
    noteId: record.id,
    category: projectTimelineCategory(record),
    sourceChannel: record.sourceChannel,
  };
}

function projectTimelineCategory(record: Pick<NoteRecord, 'type' | 'metadata' | 'source' | 'sourceChannel'>): ProjectTimelineFilterCategory {
  if (record.type === 'decision') return 'decision';
  if (hasTimelineReminder(record)) return 'reminder';
  if (record.sourceChannel === 'github-push') return 'github-push';
  if (record.sourceChannel === 'whatsapp') return 'whatsapp';
  if (record.sourceChannel === 'ai-chat') return 'ai-chat';
  return 'manual';
}

function hasTimelineReminder(record: Pick<NoteRecord, 'metadata'>) {
  return Boolean(String(record.metadata.reminderDate || '').trim() || String(record.metadata.reminderAt || '').trim());
}

function appendTimelineFolderClause(
  clauses: string[],
  values: unknown[],
  folderId: ListProjectTimelineInput['folderId'],
  folderIds: ListProjectTimelineInput['folderIds'],
) {
  if (folderIds && folderIds.length > 0) {
    const placeholders = folderIds.map((id) => {
      values.push(id);
      return `$${values.length}`;
    });
    clauses.push(`folder_id in (${placeholders.join(', ')})`);
    return;
  }
  if (folderId === undefined) return;
  const normalizedFolderId = folderId.trim();
  if (!normalizedFolderId) return;
  values.push(normalizedFolderId);
  clauses.push(`folder_id = $${values.length}`);
}

function appendTimelineCategoryClause(clauses: string[], category: ListProjectTimelineInput['category']) {
  const notDecision = "type <> 'decision'";
  const noReminder = "(coalesce(metadata->>'reminderDate', '') = '' and coalesce(metadata->>'reminderAt', '') = '')";
  if (category === 'all') return;
  if (category === 'decision') {
    clauses.push("type = 'decision'");
    return;
  }
  if (category === 'reminder') {
    clauses.push(notDecision);
    clauses.push("(coalesce(metadata->>'reminderDate', '') <> '' or coalesce(metadata->>'reminderAt', '') <> '')");
    return;
  }
  clauses.push(notDecision);
  clauses.push(noReminder);
  if (category === 'github-push') {
    clauses.push("source_channel = 'github-push'");
    return;
  }
  if (category === 'whatsapp') {
    clauses.push("source_channel = 'whatsapp'");
    return;
  }
  if (category === 'ai-chat') {
    clauses.push("source_channel = 'ai-chat'");
    return;
  }
  clauses.push("source_channel <> 'github-push'");
  clauses.push("source_channel <> 'whatsapp'");
  clauses.push("source_channel <> 'ai-chat'");
  clauses.push("(metadata->>'manual' = 'true' or source = 'manual-api')");
}

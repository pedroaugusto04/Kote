import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ContentRepository } from '../../application/ports/content.repository.js';
import { attachmentFromRow, noteFromRow, projectFromRow, workspaceFromRow } from './row.mappers.js';
import { PostgresDatabase } from './database.js';

@Injectable()
export class PostgresContentRepository extends ContentRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async listWorkspaces(userId: string) {
    const result = await this.database.getPool().query('select * from kb_workspaces where user_id = $1 order by workspace_slug', [userId]);
    return result.rows.map(workspaceFromRow);
  }

  async upsertWorkspace(userId: string, input: {
    workspaceSlug: string;
    displayName: string;
    whatsappGroupJid: string;
    telegramChatId: string;
    githubRepos: string[];
    projectSlugs: string[];
  }) {
    const result = await this.database.getPool().query(
      `insert into kb_workspaces (id, user_id, workspace_slug, display_name, whatsapp_group_jid, telegram_chat_id, github_repos, project_slugs)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
       on conflict (user_id, workspace_slug)
       do update set
         display_name = excluded.display_name,
         whatsapp_group_jid = excluded.whatsapp_group_jid,
         telegram_chat_id = excluded.telegram_chat_id,
         github_repos = excluded.github_repos,
         project_slugs = excluded.project_slugs,
         updated_at = now()
       returning *`,
      [
        crypto.randomUUID(),
        userId,
        input.workspaceSlug,
        input.displayName,
        input.whatsappGroupJid,
        input.telegramChatId,
        JSON.stringify(input.githubRepos),
        JSON.stringify(input.projectSlugs),
      ],
    );
    return workspaceFromRow(result.rows[0]);
  }

  async listProjects(userId: string) {
    const result = await this.database.getPool().query('select * from kb_projects where user_id = $1 and enabled = true order by project_slug', [userId]);
    return result.rows.map(projectFromRow);
  }

  async upsertProject(userId: string, input: {
    projectSlug: string;
    displayName: string;
    repoFullName: string;
    workspaceSlug: string;
    aliases: string[];
    defaultTags: string[];
    enabled: boolean;
  }) {
    const result = await this.database.getPool().query(
      `insert into kb_projects (id, user_id, project_slug, display_name, repo_full_name, workspace_slug, aliases, default_tags, enabled)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
       on conflict (user_id, project_slug)
       do update set
         display_name = excluded.display_name,
         repo_full_name = excluded.repo_full_name,
         workspace_slug = excluded.workspace_slug,
         aliases = excluded.aliases,
         default_tags = excluded.default_tags,
         enabled = excluded.enabled,
         updated_at = now()
       returning *`,
      [
        crypto.randomUUID(),
        userId,
        input.projectSlug,
        input.displayName,
        input.repoFullName,
        input.workspaceSlug,
        JSON.stringify(input.aliases),
        JSON.stringify(input.defaultTags),
        input.enabled,
      ],
    );
    return projectFromRow(result.rows[0]);
  }

  async listNotes(userId: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 order by occurred_at desc, title asc', [userId]);
    return result.rows.map(noteFromRow);
  }

  async getNoteById(userId: string, id: string) {
    const result = await this.database.getPool().query('select * from kb_notes where user_id = $1 and id = $2 limit 1', [userId, id]);
    return result.rows[0] ? noteFromRow(result.rows[0]) : null;
  }

  async upsertNote(userId: string, input: {
    id?: string;
    path: string;
    type: string;
    title: string;
    projectSlug: string;
    workspaceSlug: string;
    status: string;
    tags: string[];
    occurredAt: string;
    sourceChannel: string;
    summary: string;
    markdown: string;
    frontmatter: Record<string, unknown>;
    metadata: Record<string, unknown>;
    origin: string;
    source: string;
    links: string[];
  }) {
    const result = await this.database.getPool().query(
      `insert into kb_notes (
         id, user_id, path, type, title, project_slug, workspace_slug, status, tags, occurred_at,
         source_channel, summary, markdown, frontmatter, metadata, origin, source, links
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
         markdown = excluded.markdown,
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
        input.markdown,
        JSON.stringify(input.frontmatter),
        JSON.stringify(input.metadata),
        input.origin,
        input.source,
        JSON.stringify(input.links),
      ],
    );
    return noteFromRow(result.rows[0]);
  }

  async saveAttachment(userId: string, input: {
    id?: string;
    noteId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    contentBase64: string;
    checksumSha256: string;
    metadata: Record<string, unknown>;
  }) {
    const result = await this.database.getPool().query(
      `insert into kb_attachments (id, user_id, note_id, file_name, mime_type, size_bytes, storage_key, content_base64, checksum_sha256, metadata)
       values ($1, $2, $3, $4, $5, $6, '', $7, $8, $9::jsonb)
       returning *`,
      [
        input.id || crypto.randomUUID(),
        userId,
        input.noteId,
        input.fileName,
        input.mimeType,
        input.sizeBytes,
        input.contentBase64,
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

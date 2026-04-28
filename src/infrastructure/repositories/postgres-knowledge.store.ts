import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import pg from 'pg';

import { readEnvironment } from '../../adapters/environment.js';
import { KnowledgeStore } from '../../application/knowledge-store.js';
import { CredentialRecordStatus, type ReminderDispatchMode } from '../../contracts/enums.js';
import type {
  AttachmentRecord,
  ConversationStateRecord,
  ExternalIdentityRecord,
  IntegrationCredentialRecord,
  NoteRecord,
  ProjectRecord,
  WebhookEventRecord,
  WorkspaceRecord,
} from '../../application/models/repository-records.models.js';
import {
  credentialFromRow,
  identityFromRow,
  noteFromRow,
  projectFromRow,
  userFromRow,
  webhookEventFromRow,
  workspaceFromRow,
} from './postgres-row.mappers.js';

const { Pool } = pg;

@Injectable()
export class PostgresKnowledgeStore extends KnowledgeStore {
  private pool: pg.Pool | null = null;

  private getPool() {
    if (this.pool) return this.pool;
    const connectionString = readEnvironment().databaseUrl;
    if (!connectionString) throw new Error('KB_DATABASE_URL_not_configured');
    this.pool = new Pool({ connectionString });
    return this.pool;
  }

  async migrate() {
    if (!readEnvironment().databaseUrl) return;
    await this.getPool().query(`
      create table if not exists kb_users (
        id uuid primary key,
        email text not null,
        display_name text not null default '',
        password_hash text not null,
        role text not null default 'user',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table kb_users add column if not exists display_name text not null default '';
      create unique index if not exists kb_users_email_lower_idx on kb_users (lower(email));

      create table if not exists kb_integration_credentials (
        id uuid primary key,
        user_id uuid not null references kb_users(id) on delete cascade,
        workspace_slug text not null,
        provider text not null,
        status text not null default 'connected',
        encrypted_config jsonb not null,
        public_metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        revoked_at timestamptz
      );
      create unique index if not exists kb_integration_credentials_scope_idx
        on kb_integration_credentials (user_id, workspace_slug, provider);

      create table if not exists kb_external_identities (
        id uuid primary key,
        user_id uuid not null references kb_users(id) on delete cascade,
        workspace_slug text not null default 'default',
        provider text not null,
        identity_type text not null default 'external_id',
        external_id text not null,
        credential_id uuid references kb_integration_credentials(id) on delete set null,
        verified_at timestamptz,
        metadata jsonb not null default '{}'::jsonb,
        public_metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table kb_external_identities add column if not exists workspace_slug text not null default 'default';
      alter table kb_external_identities add column if not exists identity_type text not null default 'external_id';
      alter table kb_external_identities add column if not exists credential_id uuid references kb_integration_credentials(id) on delete set null;
      alter table kb_external_identities add column if not exists verified_at timestamptz;
      alter table kb_external_identities add column if not exists metadata jsonb not null default '{}'::jsonb;
      drop index if exists kb_external_identities_provider_external_idx;
      create unique index if not exists kb_external_identities_provider_type_external_idx
        on kb_external_identities (provider, identity_type, external_id);

      create table if not exists kb_workspaces (
        id uuid primary key,
        user_id uuid not null references kb_users(id) on delete cascade,
        workspace_slug text not null,
        display_name text not null,
        whatsapp_group_jid text not null default '',
        telegram_chat_id text not null default '',
        github_repos jsonb not null default '[]'::jsonb,
        project_slugs jsonb not null default '[]'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create unique index if not exists kb_workspaces_user_slug_idx on kb_workspaces (user_id, workspace_slug);

      create table if not exists kb_projects (
        id uuid primary key,
        user_id uuid not null references kb_users(id) on delete cascade,
        project_slug text not null,
        display_name text not null,
        repo_full_name text not null default '',
        workspace_slug text not null default '',
        aliases jsonb not null default '[]'::jsonb,
        default_tags jsonb not null default '[]'::jsonb,
        enabled boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create unique index if not exists kb_projects_user_slug_idx on kb_projects (user_id, project_slug);

      create table if not exists kb_notes (
        id uuid primary key,
        user_id uuid not null references kb_users(id) on delete cascade,
        path text not null,
        type text not null,
        title text not null,
        project_slug text not null,
        workspace_slug text not null default '',
        status text not null default 'active',
        tags jsonb not null default '[]'::jsonb,
        occurred_at text not null default '',
        source_channel text not null default '',
        summary text not null default '',
        markdown text not null default '',
        frontmatter jsonb not null default '{}'::jsonb,
        metadata jsonb not null default '{}'::jsonb,
        origin text not null default 'postgres',
        source text not null default '',
        links jsonb not null default '[]'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create unique index if not exists kb_notes_user_path_idx on kb_notes (user_id, path);
      create index if not exists kb_notes_user_project_idx on kb_notes (user_id, project_slug);
      create index if not exists kb_notes_user_workspace_idx on kb_notes (user_id, workspace_slug);

      create table if not exists kb_note_links (
        id uuid primary key,
        user_id uuid not null references kb_users(id) on delete cascade,
        note_id uuid not null references kb_notes(id) on delete cascade,
        target text not null,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists kb_note_links_user_note_idx on kb_note_links (user_id, note_id);

      create table if not exists kb_attachments (
        id uuid primary key,
        user_id uuid not null references kb_users(id) on delete cascade,
        note_id uuid references kb_notes(id) on delete cascade,
        file_name text not null,
        mime_type text not null default 'application/octet-stream',
        size_bytes bigint not null default 0,
        storage_key text not null default '',
        content_base64 text not null default '',
        checksum_sha256 text not null default '',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      alter table kb_attachments add column if not exists content_base64 text not null default '';
      alter table kb_attachments add column if not exists checksum_sha256 text not null default '';
      create index if not exists kb_attachments_user_note_idx on kb_attachments (user_id, note_id);

      create table if not exists kb_conversation_states (
        user_id uuid not null references kb_users(id) on delete cascade,
        workspace_slug text not null,
        conversation_key text not null,
        state jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now(),
        primary key (user_id, workspace_slug, conversation_key)
      );

      create table if not exists kb_reminder_dispatch_state (
        user_id uuid not null references kb_users(id) on delete cascade,
        workspace_slug text not null,
        mode text not null,
        dispatch_key text not null,
        reminder_id uuid not null,
        sent_at timestamptz not null default now(),
        primary key (user_id, workspace_slug, mode, dispatch_key, reminder_id)
      );

      create table if not exists kb_webhook_events (
        id uuid primary key,
        provider text not null,
        event_type text not null default '',
        status text not null,
        resolved_user_id uuid references kb_users(id) on delete set null,
        external_identity jsonb not null default '{}'::jsonb,
        raw_headers jsonb not null default '{}'::jsonb,
        raw_payload jsonb not null default '{}'::jsonb,
        error text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists kb_webhook_events_provider_status_idx on kb_webhook_events (provider, status, created_at desc);
    `);
  }

  async findUserByEmail(email: string) {
    const result = await this.getPool().query('select * from kb_users where lower(email) = lower($1) limit 1', [email]);
    return result.rows[0] ? userFromRow(result.rows[0]) : null;
  }

  async findUserById(id: string) {
    const result = await this.getPool().query('select * from kb_users where id = $1 limit 1', [id]);
    return result.rows[0] ? userFromRow(result.rows[0]) : null;
  }

  async createUser(input: { email: string; displayName?: string; passwordHash: string; role: string }) {
    const result = await this.getPool().query(
      `insert into kb_users (id, email, display_name, password_hash, role)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        crypto.randomUUID(),
        input.email.trim().toLowerCase(),
        String(input.displayName || input.email.split('@')[0] || 'User').trim(),
        input.passwordHash,
        input.role,
      ],
    );
    return userFromRow(result.rows[0]);
  }

  async listCredentials(userId: string, workspaceSlug: string) {
    const result = await this.getPool().query(
      'select * from kb_integration_credentials where user_id = $1 and workspace_slug = $2 order by provider',
      [userId, workspaceSlug],
    );
    return result.rows.map(credentialFromRow);
  }

  async upsertCredential(input: Pick<IntegrationCredentialRecord, 'userId' | 'workspaceSlug' | 'provider' | 'status' | 'encryptedConfig' | 'publicMetadata'>) {
    const result = await this.getPool().query(
      `insert into kb_integration_credentials (id, user_id, workspace_slug, provider, status, encrypted_config, public_metadata, revoked_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, null)
       on conflict (user_id, workspace_slug, provider)
       do update set
         status = excluded.status,
         encrypted_config = excluded.encrypted_config,
         public_metadata = excluded.public_metadata,
         updated_at = now(),
         revoked_at = null
       returning *`,
      [
        crypto.randomUUID(),
        input.userId,
        input.workspaceSlug,
        input.provider,
        input.status,
        JSON.stringify(input.encryptedConfig),
        JSON.stringify(input.publicMetadata),
      ],
    );
    return credentialFromRow(result.rows[0]);
  }

  async revokeCredential(userId: string, workspaceSlug: string, provider: string, encryptedConfig: unknown) {
    const result = await this.getPool().query(
      `update kb_integration_credentials
       set status = $4, encrypted_config = $5::jsonb, revoked_at = now(), updated_at = now()
       where user_id = $1 and workspace_slug = $2 and provider = $3
       returning *`,
      [userId, workspaceSlug, provider, CredentialRecordStatus.Revoked, JSON.stringify(encryptedConfig)],
    );
    return result.rows[0] ? credentialFromRow(result.rows[0]) : null;
  }

  async findCredential(userId: string, workspaceSlug: string, provider: string) {
    const result = await this.getPool().query(
      'select * from kb_integration_credentials where user_id = $1 and workspace_slug = $2 and provider = $3 limit 1',
      [userId, workspaceSlug, provider],
    );
    return result.rows[0] ? credentialFromRow(result.rows[0]) : null;
  }

  async findExternalIdentity(provider: string, identityType: string, externalId: string) {
    const result = await this.getPool().query(
      'select * from kb_external_identities where provider = $1 and identity_type = $2 and external_id = $3 limit 1',
      [provider, identityType, externalId],
    );
    return result.rows[0] ? identityFromRow(result.rows[0]) : null;
  }

  async upsertExternalIdentity(input: {
    userId: string;
    workspaceSlug: string;
    provider: string;
    identityType: string;
    externalId: string;
    credentialId?: string | null;
    verifiedAt?: string | null;
    metadata?: Record<string, unknown>;
    publicMetadata: Record<string, unknown>;
  }) {
    const result = await this.getPool().query(
      `insert into kb_external_identities (id, user_id, workspace_slug, provider, identity_type, external_id, credential_id, verified_at, metadata, public_metadata)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), $9::jsonb, $10::jsonb)
       on conflict (provider, identity_type, external_id)
       do update set
         user_id = excluded.user_id,
         workspace_slug = excluded.workspace_slug,
         credential_id = excluded.credential_id,
         verified_at = excluded.verified_at,
         metadata = excluded.metadata,
         public_metadata = excluded.public_metadata,
         updated_at = now()
       returning *`,
      [
        crypto.randomUUID(),
        input.userId,
        input.workspaceSlug,
        input.provider,
        input.identityType,
        input.externalId,
        input.credentialId || null,
        input.verifiedAt || null,
        JSON.stringify(input.metadata || {}),
        JSON.stringify(input.publicMetadata),
      ],
    );
    return identityFromRow(result.rows[0]);
  }

  async listWorkspaces(userId: string) {
    const result = await this.getPool().query('select * from kb_workspaces where user_id = $1 order by workspace_slug', [userId]);
    return result.rows.map(workspaceFromRow);
  }

  async upsertWorkspace(userId: string, input: WorkspaceRecord) {
    const result = await this.getPool().query(
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
    const result = await this.getPool().query('select * from kb_projects where user_id = $1 and enabled = true order by project_slug', [userId]);
    return result.rows.map(projectFromRow);
  }

  async upsertProject(userId: string, input: ProjectRecord) {
    const result = await this.getPool().query(
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
    const result = await this.getPool().query('select * from kb_notes where user_id = $1 order by occurred_at desc, title asc', [userId]);
    return result.rows.map(noteFromRow);
  }

  async getNoteById(userId: string, id: string) {
    const result = await this.getPool().query('select * from kb_notes where user_id = $1 and id = $2 limit 1', [userId, id]);
    return result.rows[0] ? noteFromRow(result.rows[0]) : null;
  }

  async upsertNote(userId: string, input: Omit<NoteRecord, 'id'> & { id?: string }) {
    const result = await this.getPool().query(
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
    const result = await this.getPool().query(
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
    const result = await this.getPool().query('select * from kb_attachments where user_id = $1 and note_id = $2 order by created_at', [userId, noteId]);
    return result.rows.map(attachmentFromRow);
  }

  async recordWebhookEvent(input: {
    provider: string;
    eventType: string;
    status: WebhookEventRecord['status'];
    resolvedUserId?: string | null;
    externalIdentity?: Record<string, unknown>;
    rawHeaders?: Record<string, unknown>;
    rawPayload?: unknown;
    error?: string;
  }) {
    const result = await this.getPool().query(
      `insert into kb_webhook_events (id, provider, event_type, status, resolved_user_id, external_identity, raw_headers, raw_payload, error)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)
       returning *`,
      [
        crypto.randomUUID(),
        input.provider,
        input.eventType,
        input.status,
        input.resolvedUserId || null,
        JSON.stringify(input.externalIdentity || {}),
        JSON.stringify(input.rawHeaders || {}),
        JSON.stringify(input.rawPayload || {}),
        input.error || '',
      ],
    );
    return webhookEventFromRow(result.rows[0]);
  }

  async get(userId: string, workspaceSlug: string, conversationKey: string): Promise<ConversationStateRecord | null> {
    const result = await this.getPool().query(
      'select * from kb_conversation_states where user_id = $1 and workspace_slug = $2 and conversation_key = $3 limit 1',
      [userId, workspaceSlug, conversationKey],
    );
    return result.rows[0] ? conversationStateFromRow(result.rows[0]) : null;
  }

  async upsert(userId: string, workspaceSlug: string, conversationKey: string, state: unknown) {
    const result = await this.getPool().query(
      `insert into kb_conversation_states (user_id, workspace_slug, conversation_key, state)
       values ($1, $2, $3, $4::jsonb)
       on conflict (user_id, workspace_slug, conversation_key)
       do update set state = excluded.state, updated_at = now()
       returning *`,
      [userId, workspaceSlug, conversationKey, JSON.stringify(state || {})],
    );
    return conversationStateFromRow(result.rows[0]);
  }

  async clear(userId: string, workspaceSlug: string, conversationKey: string) {
    await this.getPool().query('delete from kb_conversation_states where user_id = $1 and workspace_slug = $2 and conversation_key = $3', [
      userId,
      workspaceSlug,
      conversationKey,
    ]);
  }

  async hasSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
    const result = await this.getPool().query(
      `select 1 from kb_reminder_dispatch_state
       where user_id = $1 and workspace_slug = $2 and mode = $3 and dispatch_key = $4 and reminder_id = $5
       limit 1`,
      [userId, workspaceSlug, mode, dispatchKey, reminderId],
    );
    return Boolean(result.rows[0]);
  }

  async markSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
    await this.getPool().query(
      `insert into kb_reminder_dispatch_state (user_id, workspace_slug, mode, dispatch_key, reminder_id)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, workspace_slug, mode, dispatch_key, reminder_id) do nothing`,
      [userId, workspaceSlug, mode, dispatchKey, reminderId],
    );
  }
}

function attachmentFromRow(row: Record<string, unknown>): AttachmentRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    noteId: String(row.note_id || ''),
    fileName: String(row.file_name || ''),
    mimeType: String(row.mime_type || 'application/octet-stream'),
    sizeBytes: Number(row.size_bytes || 0),
    contentBase64: String(row.content_base64 || ''),
    checksumSha256: String(row.checksum_sha256 || ''),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
  };
}

function conversationStateFromRow(row: Record<string, unknown>): ConversationStateRecord {
  return {
    userId: String(row.user_id),
    workspaceSlug: String(row.workspace_slug),
    conversationKey: String(row.conversation_key),
    state: row.state || {},
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || ''),
  };
}

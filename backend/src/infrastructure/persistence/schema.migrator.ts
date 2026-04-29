import { Injectable } from '@nestjs/common';

import { SchemaMigrator } from '../../application/ports/auth.repository.js';
import { PostgresDatabase } from './database.js';

@Injectable()
export class PostgresSchemaMigrator extends SchemaMigrator {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async migrate() {
    if (!this.database.isConfigured()) return;
    await this.database.getPool().query(`
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

      create table if not exists kb_integration_connection_sessions (
        id uuid primary key,
        user_id uuid not null references kb_users(id) on delete cascade,
        workspace_slug text not null default 'default',
        provider text not null,
        state_hash text not null,
        verification_code_hash text not null,
        status text not null default 'pending',
        metadata jsonb not null default '{}'::jsonb,
        expires_at timestamptz not null,
        consumed_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists kb_integration_connection_sessions_state_idx
        on kb_integration_connection_sessions (provider, state_hash, status, expires_at);
      create index if not exists kb_integration_connection_sessions_code_idx
        on kb_integration_connection_sessions (provider, verification_code_hash, status, expires_at);
      create index if not exists kb_integration_connection_sessions_user_idx
        on kb_integration_connection_sessions (user_id, workspace_slug, provider, created_at desc);

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
}

import test from 'node:test';
import assert from 'node:assert/strict';

import { noteFromRow, projectFromRow, workspaceFromRow } from '../../dist/infrastructure/mappers/row.mappers.js';

test('row mappers read drizzle camelCase rows', () => {
  const workspace = workspaceFromRow({
    workspaceSlug: 'default',
    displayName: 'Default workspace',
    whatsappChatJid: '120363@g.us',
    telegramChatId: 'telegram-chat-1',
    createdAt: new Date('2026-04-28T00:00:00.000Z'),
    updatedAt: new Date('2026-04-28T00:00:00.000Z'),
  });

  assert.equal(workspace.workspaceSlug, 'default');
  assert.equal(workspace.displayName, 'Default workspace');
  assert.equal(workspace.whatsappChatJid, '120363@g.us');

  const note = noteFromRow({
    id: 'note-1',
    path: '20 Inbox/acme/item.md',
    type: 'event',
    title: 'Shared state',
    projectSlug: 'acme',
    workspaceSlug: 'default',
    status: 'pending',
    tags: ['shared'],
    occurredAt: new Date('2026-04-28T00:00:00.000Z'),
    sourceChannel: 'test',
    summary: 'Shared state summary',
    markdownStorageKey: 'notes/note-1.md',
    metadata: {},
    source: 'test',
    sessionId: '',
    reminderDate: '2026-04-28',
    reminderAt: '2026-04-28T12:00:00.000Z',
    attachmentCount: 2,
    isPinned: false,
  });

  assert.equal(note.workspaceSlug, 'default');
  assert.equal(note.projectSlug, 'acme');
  assert.equal(note.attachmentCount, 2);

  const project = projectFromRow({
    projectSlug: 'acme',
    displayName: 'Acme',
    workspaceSlug: 'default',
    repositories: [],
    defaultTags: ['api'],
    enabled: true,
    isFavorite: true,
  });

  assert.equal(project.workspaceSlug, 'default');
  assert.equal(project.favorite, true);
});

test('row mappers still read raw sql snake_case rows', () => {
  const workspace = workspaceFromRow({
    workspace_slug: 'legacy',
    display_name: 'Legacy workspace',
    whatsapp_chat_jid: '120363@g.us',
    telegram_chat_id: '',
    created_at: '2026-04-28T00:00:00.000Z',
    updated_at: '2026-04-28T00:00:00.000Z',
  });

  assert.equal(workspace.workspaceSlug, 'legacy');
  assert.equal(workspace.displayName, 'Legacy workspace');
});

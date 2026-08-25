import test from 'node:test';
import assert from 'node:assert/strict';

import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

test('commit ordering does not treat a missing note SHA as an exact match', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
  });
  const project = await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'billing',
    displayName: 'Billing',
    workspaceId: workspace.id,
    repositories: [],
    defaultTags: [],
    enabled: true,
    favorite: false,
  });
  const baseNote = {
    projectId: project.id,
    workspaceId: workspace.id,
    projectSlug: 'billing',
    workspaceSlug: 'default',
    type: 'note',
    status: 'active',
    tags: [],
    categories: [],
    sourceChannel: 'ide',
    source: 'ide',
    summary: '',
    markdown: '',
    frontmatter: {},
    sessionId: '',
    links: ['src/billing/retry.ts'],
  };

  await repositories.contentRepository.upsertNote(user.id, {
    ...baseNote,
    path: '20 Inbox/billing/newer.md',
    title: 'Newer note without SHA',
    occurredAt: '2026-08-24T12:00:00.000Z',
    metadata: {},
  });
  const exact = await repositories.contentRepository.upsertNote(user.id, {
    ...baseNote,
    path: '20 Inbox/billing/older-exact.md',
    title: 'Older exact commit',
    occurredAt: '2026-08-20T12:00:00.000Z',
    metadata: { headSha: 'abcdef1234567890' },
  });

  const matches = await repositories.noteContextRepository.findNotesByFile(
    user.id,
    'src/billing/retry.ts',
    { limit: 1, projectSlug: 'billing', commitHashes: ['abcdef1234567890'] },
  );

  assert.equal(matches[0].id, exact.id);
});

test('handles multiple commitHashes in findNotesByFile without query errors', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const workspace = await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
  });
  const project = await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'kote',
    displayName: 'Kote',
    workspaceId: workspace.id,
    repositories: [],
    defaultTags: [],
    enabled: true,
    favorite: false,
  });

  await repositories.contentRepository.upsertNote(user.id, {
    projectId: project.id,
    workspaceId: workspace.id,
    projectSlug: 'kote',
    workspaceSlug: 'default',
    type: 'note',
    status: 'active',
    tags: [],
    categories: [],
    sourceChannel: 'ide',
    source: 'ide',
    summary: '',
    markdown: '',
    frontmatter: {},
    sessionId: '',
    links: ['backend/src/application/services/billing/SubscriptionCancellationService.ts'],
    path: '20 Inbox/kote/cancellation.md',
    title: 'Cancellation service note',
    occurredAt: '2026-08-25T10:00:00.000Z',
    metadata: { commitHash: '6abeab985b573c9212a32dcdcee3cee73269e56b' },
  });

  const matches = await repositories.noteContextRepository.findNotesByFile(
    user.id,
    'backend/src/application/services/billing/SubscriptionCancellationService.ts',
    {
      limit: 10,
      projectSlug: 'kote',
      commitHashes: [
        '6abeab985b573c9212a32dcdcee3cee73269e56b',
        '6abeab985b573c9212a32dcdcee3cee73269e56b',
        'f7bd05de5452edb7c3a4d43d88d4a87d6b02b2ea',
      ],
    },
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].title, 'Cancellation service note');
});

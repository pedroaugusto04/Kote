import test from 'node:test';
import assert from 'node:assert/strict';

import { QueryKnowledgeUseCase } from '../../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

async function seedDefaultWorkspace(repositories, userId) {
  const ws = await repositories.contentRepository.upsertWorkspace(userId, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: '',
    githubRepos: [],
    projectSlugs: ['n8n-automations'],
    createdAt: '2026-04-27T10:00:00.000Z',
    updatedAt: '2026-04-27T10:00:00.000Z',
  });
  await repositories.contentRepository.upsertProject(userId, {
    projectSlug: 'n8n-automations',
    displayName: 'N8N Automations',
    repositories: [],
    workspaceSlug: 'default',
    defaultTags: [],
    enabled: true,
  });
  return ws;
}

test('query returns ranked matches from the authenticated user repository scope', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const otherUser = await repositories.createTestUser();
  const queryRepository = repositories.contentQueryRepository;
  const ws = await seedDefaultWorkspace(repositories, user.id);
  await seedDefaultWorkspace(repositories, otherUser.id);
  const categories = await repositories.contentRepository.listCategories(user.id, ws.id);
  const noteCategory = categories.find((category) => category.name === 'event') || categories[0];
  const deployNote = await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/deploy.md',
    type: 'event',
    title: 'Deploy rollout',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: ['deploy', 'webhook'],
    occurredAt: '2026-04-27',
    sourceChannel: 'test',
    summary: 'Precisamos revisar o timeout do webhook e validar o rollout.',
    markdown: '',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'test',
    links: [],
    categoryIds: noteCategory ? [noteCategory.id] : [],
  });
  await repositories.contentRepository.setNotePinned(user.id, deployNote.id, true);
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/deploy-resolved.md',
    type: 'event',
    title: 'Deploy rollout resolvido',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'resolved',
    tags: ['deploy', 'webhook'],
    occurredAt: '2026-04-27',
    sourceChannel: 'test',
    summary: 'Timeout do webhook resolvido.',
    markdown: '',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'test',
    links: [],
  });
  await repositories.contentRepository.upsertNote(otherUser.id, {
    path: '20 Inbox/other/deploy.md',
    type: 'event',
    title: 'Other Deploy',
    projectSlug: 'other',
    workspaceSlug: 'default',
    status: 'active',
    tags: ['deploy'],
    occurredAt: '2026-04-27',
    sourceChannel: 'test',
    summary: 'Should not leak.',
    markdown: '',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'test',
    links: [],
  });

  const result = await new QueryKnowledgeUseCase(queryRepository).execute(
    { query: 'timeout webhook deploy', projectSlug: 'n8n-automations', limit: 3 },
    user.id,
  );

  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches.map((match) => match.title).sort(), ['Deploy rollout', 'Deploy rollout resolvido']);
  assert.equal(result.matches.some((match) => match.title === 'Other Deploy'), false);
  const pinnedMatch = result.matches.find((match) => match.title === 'Deploy rollout');
  assert.equal(pinnedMatch?.isPinned, true);
  assert.equal(pinnedMatch?.folderId, null);
  assert.deepEqual(pinnedMatch?.categories.map((category) => category.id), noteCategory ? [noteCategory.id] : []);
  assert.match(result.answer.answer, /I found 2 relevant note/);
});

test('query filters textual matches by note status', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedDefaultWorkspace(repositories, user.id);
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/active.md',
    type: 'event',
    title: 'Webhook ativo',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: ['webhook'],
    occurredAt: '2026-04-27',
    sourceChannel: 'test',
    summary: 'Timeout webhook ativo.',
    markdown: '',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'test',
    links: [],
  });
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/resolved.md',
    type: 'event',
    title: 'Webhook resolvido',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'resolved',
    tags: ['webhook'],
    occurredAt: '2026-04-27',
    sourceChannel: 'test',
    summary: 'Timeout webhook resolvido.',
    markdown: '',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'test',
    links: [],
  });

  const result = await new QueryKnowledgeUseCase(repositories.contentQueryRepository).execute(
    { query: 'webhook timeout', workspaceSlug: 'default', status: 'resolved', limit: 10 },
    user.id,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.matches.map((match) => match.title), ['Webhook resolvido']);
});

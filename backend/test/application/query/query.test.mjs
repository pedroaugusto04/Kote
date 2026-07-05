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

  // Mock embedding dependencies (no embeddings configured, should fall back to keyword search)
  const mockEmbeddingGateway = {
    generateEmbeddings: async () => [],
  };
  const mockNoteEmbeddingRepository = {
    findSimilar: async () => [],
    getNotesEmbeddings: async () => [],
  };

  const result = await new QueryKnowledgeUseCase(
    queryRepository,
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    repositories.runtimeEnvironmentProvider,
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  ).execute(
    { query: 'timeout webhook deploy', projectId: undefined, limit: 3 },
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

  const mockEmbeddingGateway = {
    generateEmbeddings: async () => [],
  };
  const mockNoteEmbeddingRepository = {
    findSimilar: async () => [],
    getNotesEmbeddings: async () => [],
  };

  const result = await new QueryKnowledgeUseCase(
    repositories.contentQueryRepository,
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    repositories.runtimeEnvironmentProvider,
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  ).execute(
    { query: 'webhook timeout', status: 'resolved', limit: 10 },
    user.id,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.matches.map((match) => match.title), ['Webhook resolvido']);
});

test('query handles special query: summarize my recent notes', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedDefaultWorkspace(repositories, user.id);

  // Seed notes with different occurredAt dates
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/older.md',
    type: 'event',
    title: 'Older Note',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: [],
    occurredAt: '2026-04-20T10:00:00.000Z',
    sourceChannel: 'test',
    summary: 'Older summary',
    markdown: '',
  });

  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/newer.md',
    type: 'event',
    title: 'Newer Note',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: [],
    occurredAt: '2026-04-25T10:00:00.000Z',
    sourceChannel: 'test',
    summary: 'Newer summary',
    markdown: '',
  });

  const mockEmbeddingGateway = {
    generateEmbeddings: async () => [],
  };
  const mockNoteEmbeddingRepository = {
    findSimilar: async () => [],
    getNotesEmbeddings: async () => [],
  };

  const result = await new QueryKnowledgeUseCase(
    repositories.contentQueryRepository,
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    repositories.runtimeEnvironmentProvider,
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  ).execute(
    { query: 'Summarize my recent notes', limit: 10 },
    user.id,
  );

  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 2);
  // Should be sorted by date (newest first)
  assert.deepEqual(result.matches.map((m) => m.title), ['Newer Note', 'Older Note']);
});

test('query handles special query: what are my action items?', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await seedDefaultWorkspace(repositories, user.id);

  // Active note with followup tag
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/todo.md',
    type: 'event',
    title: 'Followup task',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: ['followup'],
    occurredAt: '2026-04-25T10:00:00.000Z',
    sourceChannel: 'test',
    summary: 'Do something',
    markdown: '',
  });

  // Active note without action items
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/regular.md',
    type: 'event',
    title: 'Regular Note',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: [],
    occurredAt: '2026-04-25T10:00:00.000Z',
    sourceChannel: 'test',
    summary: 'Just info',
    markdown: '',
  });

  const mockEmbeddingGateway = {
    generateEmbeddings: async () => [],
  };
  const mockNoteEmbeddingRepository = {
    findSimilar: async () => [],
    getNotesEmbeddings: async () => [],
  };

  const result = await new QueryKnowledgeUseCase(
    repositories.contentQueryRepository,
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    repositories.runtimeEnvironmentProvider,
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  ).execute(
    { query: 'What are my action items?', limit: 10 },
    user.id,
  );

  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].title, 'Followup task');
});

test('query handles special query: review key decisions made', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const ws = await seedDefaultWorkspace(repositories, user.id);

  const categoriesList = await repositories.contentRepository.listCategories(user.id, ws.id);
  let decisionCategory = categoriesList.find((cat) => cat.name === 'decision');
  if (!decisionCategory) {
    decisionCategory = await repositories.contentRepository.createCategory(user.id, ws.id, {
      name: 'decision',
      color: '#4caf50',
      icon: 'gavel',
    });
  }

  // Note with type decision
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/decision.md',
    type: 'decision',
    title: 'Decision Note',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: [],
    occurredAt: '2026-04-25T10:00:00.000Z',
    sourceChannel: 'test',
    summary: 'We decided X',
    markdown: '',
    categoryIds: [decisionCategory.id],
  });

  // Regular note
  await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/2026/04/regular.md',
    type: 'event',
    title: 'Regular Note',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: [],
    occurredAt: '2026-04-25T10:00:00.000Z',
    sourceChannel: 'test',
    summary: 'Just info',
    markdown: '',
  });

  const mockEmbeddingGateway = {
    generateEmbeddings: async () => [],
  };
  const mockNoteEmbeddingRepository = {
    findSimilar: async () => [],
    getNotesEmbeddings: async () => [],
  };

  const result = await new QueryKnowledgeUseCase(
    repositories.contentQueryRepository,
    mockEmbeddingGateway,
    mockNoteEmbeddingRepository,
    repositories.runtimeEnvironmentProvider,
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  ).execute(
    { query: 'Review key decisions made', limit: 10 },
    user.id,
  );

  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].title, 'Decision Note');
});


import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryKnowledgeStore } from '../dist/application/knowledge-store.js';
import { PostgresContentQueryRepository } from '../dist/infrastructure/repositories/postgres-content.repository.js';
import { QueryKnowledgeUseCase } from '../dist/application/use-cases/index.js';

test('query returns ranked matches from the authenticated user repository scope', async () => {
  const store = new MemoryKnowledgeStore();
  const queryRepository = new PostgresContentQueryRepository(store);
  await store.upsertNote('user-1', {
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
  });
  await store.upsertNote('user-2', {
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
    { query: 'timeout webhook deploy', mode: 'answer', projectSlug: 'n8n-automations', limit: 3 },
    'user-1',
  );

  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].title, 'Deploy rollout');
  assert.match(result.answer.answer, /Encontrei 1 nota/);
});

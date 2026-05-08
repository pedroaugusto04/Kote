import test from 'node:test';
import assert from 'node:assert/strict';

import { QueryKnowledgeUseCase } from '../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

test('query returns ranked matches from the authenticated user repository scope', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const otherUser = await repositories.createTestUser();
  const queryRepository = repositories.contentQueryRepository;
  await repositories.contentRepository.upsertNote(user.id, {
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
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].title, 'Deploy rollout');
  assert.match(result.answer.answer, /Encontrei 1 nota/);
});

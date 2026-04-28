import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryKnowledgeStore } from '../dist/application/knowledge-store.js';
import { PostgresContentQueryRepository } from '../dist/infrastructure/repositories/postgres-content.repository.js';
import { IngestEntryUseCase, ProcessConversationUseCase } from '../dist/application/use-cases/index.js';

async function createUseCase() {
  const store = new MemoryKnowledgeStore();
  await store.upsertProject('user-1', {
    projectSlug: 'n8n-automations',
    displayName: 'N8N Automations',
    repoFullName: '',
    workspaceSlug: 'default',
    aliases: ['n8n'],
    defaultTags: [],
    enabled: true,
  });
  const ingest = new IngestEntryUseCase(store);
  const useCase = new ProcessConversationUseCase(store, new PostgresContentQueryRepository(store), store, ingest);
  return { store, useCase };
}

function input(messageText, extras = {}) {
  return {
    messageText,
    senderId: '5511999999999@s.whatsapp.net',
    groupId: 'group@g.us',
    messageId: `msg-${Date.now()}-${Math.random()}`,
    hasMedia: false,
    media: {},
    ...extras,
  };
}

test('conversation stores state per user/workspace and ingests on confirm', async () => {
  const { store, useCase } = await createUseCase();

  const step1 = await useCase.execute(
    input('corrigi timeout no webhook', {
      agentResult: {
        extracted: {
          rawText: 'corrigi timeout no webhook',
          kind: 'bug',
          projectSlug: 'n8n',
          importance: 'high',
        },
        missingFields: ['reminderDate', 'confirmation'],
        confidence: 'high',
      },
    }),
    'user-1',
    'default',
  );
  assert.equal(step1.action, 'reply');
  assert.match(step1.replyText, /lembrete/i);

  const step2 = await useCase.execute(input('9'), 'user-1', 'default');
  assert.equal(step2.action, 'reply');
  assert.match(step2.replyText, /Resumo da nota/);

  const step3 = await useCase.execute(input('sim'), 'user-1', 'default');
  assert.equal(step3.action, 'submit');
  assert.equal(step3.ingestResult.ok, true);
  assert.equal(step3.payload.event.projectSlug, 'n8n-automations');
  assert.equal((await store.listNotes('user-1')).length, 1);
});

test('conversation answers explicit knowledge queries without starting capture flow', async () => {
  const { useCase, store } = await createUseCase();
  await store.upsertNote('user-1', {
    path: '20 Inbox/n8n-automations/2026/04/deploy.md',
    type: 'event',
    title: 'Deploy checklist',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: ['deploy'],
    occurredAt: '2026-04-27',
    sourceChannel: 'test',
    summary: 'Revisar timeout e validar webhook em producao.',
    markdown: '',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'test',
    links: [],
  });

  const result = await useCase.execute(input('/buscar deploy webhook'), 'user-1', 'default');
  assert.equal(result.action, 'reply');
  assert.match(result.replyText, /deploy/i);
  assert.match(result.replyText, /20 Inbox\/n8n-automations\//);
});

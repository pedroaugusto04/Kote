import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryKnowledgeStore } from '../dist/application/knowledge-store.js';
import { PostgresContentQueryRepository } from '../dist/infrastructure/repositories/postgres-content.repository.js';
import { BuildReminderDispatchUseCase, MarkReminderAsSentUseCase } from '../dist/application/use-cases/index.js';

async function createStoreWithReminder() {
  const store = new MemoryKnowledgeStore();
  await store.upsertNote('user-1', {
    id: '11111111-1111-1111-1111-111111111111',
    path: '60 Reminders/n8n-automations/reminder.md',
    type: 'reminder',
    title: 'Reminder deploy',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'open',
    tags: [],
    occurredAt: '2099-12-31T09:00:00-03:00',
    sourceChannel: 'test',
    summary: 'Reminder deploy',
    markdown: '',
    frontmatter: {},
    metadata: {
      reminderDate: '2099-12-31',
      reminderTime: '09:00',
      reminderAt: '2099-12-31T09:00:00-03:00',
    },
    origin: 'postgres',
    source: 'test',
    links: [],
  });
  return store;
}

test('daily reminders are aggregated once per date by user and workspace', async () => {
  const store = await createStoreWithReminder();
  const useCase = new BuildReminderDispatchUseCase(new PostgresContentQueryRepository(store), store);

  const first = await useCase.execute('daily', 'user-1', 'default');
  const second = await useCase.execute('daily', 'user-1', 'default');

  assert.equal(first.ok, true);
  assert.equal(first.shouldSend, true);
  assert.equal(second.shouldSend, false);
});

test('markRemindersAsSent updates exact reminder state', async () => {
  const store = await createStoreWithReminder();
  const marker = new MarkReminderAsSentUseCase(store);
  const result = await marker.execute(['11111111-1111-1111-1111-111111111111'], 'user-1', 'default', 'exact', '2099-12-31T09:00');

  assert.equal(result.ok, true);
  assert.equal(result.marked, 1);
  assert.equal(await store.hasSent('user-1', 'default', 'exact', '2099-12-31T09:00', '11111111-1111-1111-1111-111111111111'), true);
});

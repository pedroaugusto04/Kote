import test from 'node:test';
import assert from 'node:assert/strict';

import { BuildReminderDispatchUseCase, MarkReminderAsSentUseCase } from '../../dist/application/use-cases/index.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

async function createStoreWithReminder(t) {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await repositories.contentRepository.upsertNote(user.id, {
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
  return { repositories, user };
}

test('daily reminders are aggregated once per date by user and workspace', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  const useCase = new BuildReminderDispatchUseCase(repositories.contentQueryRepository, repositories.reminderDispatchRepository);

  const first = await useCase.execute('daily', user.id, 'default');
  const second = await useCase.execute('daily', user.id, 'default');

  assert.equal(first.ok, true);
  assert.equal(first.shouldSend, true);
  assert.equal(second.shouldSend, false);
});

test('markRemindersAsSent updates exact reminder state', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  const marker = new MarkReminderAsSentUseCase(repositories.reminderDispatchRepository);
  const result = await marker.execute(['11111111-1111-1111-1111-111111111111'], user.id, 'default', 'exact', '2099-12-31T09:00');

  assert.equal(result.ok, true);
  assert.equal(result.marked, 1);
  assert.equal(await repositories.reminderDispatchRepository.hasSent(user.id, 'default', 'exact', '2099-12-31T09:00', '11111111-1111-1111-1111-111111111111'), true);
});

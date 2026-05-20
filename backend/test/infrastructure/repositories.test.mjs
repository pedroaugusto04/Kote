import 'reflect-metadata';

import test from 'node:test';
import assert from 'node:assert/strict';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../../dist/app.module.js';
import { SchemaMigrator, UserRepository } from '../../dist/application/ports/auth.repository.js';
import { ContentQueryRepository, ContentRepository } from '../../dist/application/ports/content.repository.js';
import { CredentialRepository, ExternalIdentityRepository } from '../../dist/application/ports/integrations.repository.js';
import { ReminderDeliveryGateway } from '../../dist/application/ports/reminder-delivery.gateway.js';
import { WebhookEventRepository } from '../../dist/application/ports/webhook-events.repository.js';
import { ConversationStateRepository, ReminderDispatchRepository } from '../../dist/application/ports/workflow-state.repository.js';
import { ReminderDeliveryChannel, ReminderDispatchMode } from '../../dist/contracts/enums.js';
import { EvolutionReminderDeliveryGateway } from '../../dist/adapters/evolution.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

test('postgres repositories share state across content query and workflow ports', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const note = await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/acme/2026/04/item.md',
    type: 'event',
    title: 'Shared state',
    projectSlug: 'acme',
    workspaceSlug: 'default',
    status: 'pending',
    tags: ['shared'],
    occurredAt: '2026-04-28',
    sourceChannel: 'test',
    summary: 'Shared state summary',
    markdown: '',
    frontmatter: {},
    metadata: {
      reminderDate: '2026-04-28',
      reminderTime: '09:00',
      reminderAt: '2026-04-28T12:00:00.000Z',
    },
    origin: 'postgres',
    source: 'test',
    links: [],
  });

  const reminders = await repositories.contentQueryRepository.listReminders(user.id);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].id, note.id);
  assert.equal(reminders[0].relativePath, note.path);

  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '120363@g.us',
    telegramChatId: 'telegram-chat-1',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
  });
  const dueWhatsappReminders = await repositories.contentQueryRepository.listDueRemindersByChannel(ReminderDeliveryChannel.Whatsapp, '2026-04-28T12:00:00.000Z');
  assert.equal(dueWhatsappReminders.length, 1);
  assert.equal(dueWhatsappReminders[0].reminderId, note.id);
  assert.equal(dueWhatsappReminders[0].recipientId, '120363@g.us');
  assert.equal(dueWhatsappReminders[0].channel, ReminderDeliveryChannel.Whatsapp);

  const dueTelegramReminders = await repositories.contentQueryRepository.listDueRemindersByChannel(ReminderDeliveryChannel.Telegram, '2026-04-28T12:00:00.000Z');
  assert.equal(dueTelegramReminders.length, 1);
  assert.equal(dueTelegramReminders[0].recipientId, 'telegram-chat-1');
  assert.equal(dueTelegramReminders[0].channel, ReminderDeliveryChannel.Telegram);

  await repositories.conversationStateRepository.upsert(user.id, 'default', 'conversation-1', { phase: 'collecting' });
  const storedState = await repositories.conversationStateRepository.get(user.id, 'default', 'conversation-1');
  assert.deepEqual(storedState?.state, { phase: 'collecting' });

  assert.equal(await repositories.reminderDispatchRepository.hasSent(user.id, 'default', 'daily', '2026-04-28', note.id), false);
  const retryKey = {
    userId: user.id,
    workspaceSlug: 'default',
    mode: ReminderDispatchMode.Exact,
    dispatchKey: '2026-04-28T12:00',
    reminderId: note.id,
    channel: ReminderDeliveryChannel.Whatsapp,
  };
  assert.equal(await repositories.reminderDispatchRepository.getRetryState(retryKey), null);
  const failureState = await repositories.reminderDispatchRepository.recordFailure({
    ...retryKey,
    nextRetryAt: '2026-04-28T12:01:00.000Z',
    error: 'evolution_api_http_500',
  });
  assert.equal(failureState.attemptCount, 1);
  assert.equal((await repositories.reminderDispatchRepository.getRetryState(retryKey))?.nextRetryAt, '2026-04-28T12:01:00.000Z');
  await repositories.reminderDispatchRepository.clearFailure(retryKey);
  assert.equal(await repositories.reminderDispatchRepository.getRetryState(retryKey), null);
  await repositories.reminderDispatchRepository.markSent(user.id, 'default', 'daily', '2026-04-28', note.id);
  assert.equal(await repositories.reminderDispatchRepository.hasSent(user.id, 'default', 'daily', '2026-04-28', note.id), true);
  await repositories.contentRepository.deleteNote(user.id, note.id);
  assert.equal((await repositories.contentQueryRepository.listReminders(user.id)).length, 0);
});

test('app module resolves repository providers without KnowledgeStore wiring', async () => {
  delete process.env.KB_DATABASE_URL;
  delete process.env.KB_ADMIN_EMAIL;
  delete process.env.KB_ADMIN_PASSWORD;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    assert.ok(app.get(SchemaMigrator));
    assert.ok(app.get(UserRepository));
    assert.ok(app.get(CredentialRepository));
    assert.ok(app.get(ExternalIdentityRepository));
    assert.ok(app.get(ContentRepository));
    assert.ok(app.get(ContentQueryRepository));
    assert.ok(app.get(ConversationStateRepository));
    assert.ok(app.get(ReminderDispatchRepository));
    assert.ok(app.get(ReminderDeliveryGateway) instanceof EvolutionReminderDeliveryGateway);
    assert.ok(app.get(WebhookEventRepository));
  } finally {
    await app.close();
  }
});

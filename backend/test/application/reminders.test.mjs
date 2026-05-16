import test from 'node:test';
import assert from 'node:assert/strict';

import { BuildReminderDispatchUseCase, DispatchDueTelegramRemindersUseCase, ListPaginatedRemindersUseCase, MarkReminderAsSentUseCase } from '../../dist/application/use-cases/index.js';
import { ReminderDispatchMode } from '../../dist/contracts/enums.js';
import { reminderDispatchKey } from '../../dist/application/use-cases/reminders/reminder-schedule.js';
import { TelegramReminderDispatchWorker } from '../../dist/application/services/telegram-reminder-dispatch.worker.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

async function createStoreWithReminder(t) {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: 'telegram-chat-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await repositories.contentRepository.upsertNote(user.id, {
    id: '11111111-1111-1111-1111-111111111111',
    path: '20 Inbox/n8n-automations/deploy.md',
    type: 'event',
    title: 'Deploy',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: [],
    occurredAt: '2099-12-31T12:00:00.000Z',
    sourceChannel: 'test',
    summary: 'Deploy',
    markdown: '',
    frontmatter: {},
    metadata: {
      reminderDate: '2099-12-31',
      reminderTime: '09:00',
      reminderAt: '2099-12-31T12:00:00.000Z',
    },
    origin: 'postgres',
    source: 'test',
    links: [],
  });
  return { repositories, user };
}

async function insertReminder(repositories, userId, input) {
  return repositories.contentRepository.upsertNote(userId, {
    path: input.path,
    type: 'event',
    title: input.title,
    projectSlug: input.projectSlug || 'n8n-automations',
    workspaceSlug: input.workspaceSlug || 'default',
    status: input.status || 'active',
    tags: [],
    occurredAt: input.occurredAt || input.metadata.reminderAt || `${input.metadata.reminderDate}T00:00:00.000Z`,
    sourceChannel: 'test',
    summary: input.title,
    markdown: '',
    frontmatter: {},
    metadata: input.metadata,
    origin: 'postgres',
    source: 'test',
    links: [],
  });
}

function createLoggerStub() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function environmentProvider(reminderTimeZone = 'America/Sao_Paulo') {
  return {
    read: () => ({ reminderTimeZone }),
  };
}

test('daily reminders are aggregated once per date by user and workspace', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  const useCase = new BuildReminderDispatchUseCase(repositories.contentQueryRepository, repositories.reminderDispatchRepository, environmentProvider());

  const first = await useCase.execute('daily', user.id, 'default', new Date('2099-12-31T12:00:00.000Z'));
  const second = await useCase.execute('daily', user.id, 'default', new Date('2099-12-31T12:00:00.000Z'));

  assert.equal(first.ok, true);
  assert.equal(first.shouldSend, true);
  assert.equal(second.shouldSend, false);
});

test('markRemindersAsSent updates exact reminder state', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  const marker = new MarkReminderAsSentUseCase(repositories.reminderDispatchRepository);
  const result = await marker.execute(['11111111-1111-1111-1111-111111111111'], user.id, 'default', 'exact', '2099-12-31T12:00');

  assert.equal(result.ok, true);
  assert.equal(result.marked, 1);
  assert.equal(await repositories.reminderDispatchRepository.hasSent(user.id, 'default', 'exact', '2099-12-31T12:00', '11111111-1111-1111-1111-111111111111'), true);
});

test('paginated reminders expose backend reminder status for expired and sent items', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const listReminders = new ListPaginatedRemindersUseCase(repositories.contentQueryRepository, repositories.reminderDispatchRepository, environmentProvider());

  const expiredReminder = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/expired.md',
    title: 'Expired reminder',
    metadata: {
      reminderDate: '2026-05-05',
      reminderTime: '09:00',
      reminderAt: '2026-05-05T09:00:00.000Z',
    },
  });

  const sentReminder = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/sent.md',
    title: 'Sent reminder',
    metadata: {
      reminderDate: '2026-05-08',
      reminderTime: '11:00',
      reminderAt: '2026-05-08T11:00:00.000Z',
    },
  });

  await repositories.reminderDispatchRepository.markSent(
    user.id,
    'default',
    ReminderDispatchMode.Exact,
    reminderDispatchKey('2026-05-08T11:00:00.000Z'),
    sentReminder.id,
  );

  const listed = await listReminders.execute(user.id, { page: 1, pageSize: 10 });
  const expired = listed.items.find((item) => item.id === expiredReminder.id);
  const sent = listed.items.find((item) => item.id === sentReminder.id);

  assert.equal(expired?.status, 'expired');
  assert.equal(sent?.status, 'sent');

  const sentOnly = await listReminders.execute(user.id, { page: 1, pageSize: 10, status: 'sent' });
  assert.deepEqual(sentOnly.items.map((item) => item.id), [sentReminder.id]);
});

test('paginated reminders sort all statuses with pending first and date ascending', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const listReminders = new ListPaginatedRemindersUseCase(repositories.contentQueryRepository, repositories.reminderDispatchRepository, environmentProvider());

  const sentReminder = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/sent-later.md',
    title: 'Sent later',
    metadata: {
      reminderDate: '2026-05-08',
      reminderTime: '11:00',
      reminderAt: '2026-05-08T11:00:00.000Z',
    },
  });
  await repositories.reminderDispatchRepository.markSent(
    user.id,
    'default',
    ReminderDispatchMode.Exact,
    reminderDispatchKey('2026-05-08T11:00:00.000Z'),
    sentReminder.id,
  );

  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/pending-earlier.md',
    title: 'Pending earlier',
    metadata: {
      reminderDate: '2099-12-30',
      reminderTime: '09:00',
      reminderAt: '2099-12-30T09:00:00.000Z',
    },
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/pending-later.md',
    title: 'Pending later',
    metadata: {
      reminderDate: '2099-12-31',
      reminderTime: '09:00',
      reminderAt: '2099-12-31T09:00:00.000Z',
    },
  });
  const archivedReminder = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/archived-earliest.md',
    title: 'Archived earliest',
    status: 'archived',
    metadata: {
      reminderDate: '2026-05-01',
      reminderTime: '08:00',
      reminderAt: '2026-05-01T08:00:00.000Z',
    },
  });

  const listed = await listReminders.execute(user.id, { page: 1, pageSize: 10 });

  assert.deepEqual(
    listed.items.map((item) => ({ title: item.title, status: item.status })),
    [
      { title: 'Pending earlier', status: 'pending' },
      { title: 'Pending later', status: 'pending' },
      { title: archivedReminder.title, status: 'archived' },
      { title: sentReminder.title, status: 'sent' },
    ],
  );
});

test('global due reminder read model includes only due reminders with telegram workspace chat', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const otherUser = await repositories.createTestUser();
  const now = '2026-05-05T09:30:00.000Z';

  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: 'telegram-chat-1',
    createdAt: now,
    updatedAt: now,
  });
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'no-chat',
    displayName: 'No Chat',
    whatsappGroupJid: '',
    telegramChatId: '',
    createdAt: now,
    updatedAt: now,
  });
  await repositories.contentRepository.upsertWorkspace(otherUser.id, {
    workspaceSlug: 'default',
    displayName: 'Other',
    whatsappGroupJid: '',
    telegramChatId: 'telegram-chat-2',
    createdAt: now,
    updatedAt: now,
  });

  const due = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/due.md',
    title: 'Due exact',
    metadata: {
      reminderDate: '2026-05-05',
      reminderTime: '09:15',
      reminderAt: '2026-05-05T09:15:00.000Z',
    },
  });
  const dateOnly = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/date-only.md',
    title: 'Date only',
    metadata: {
      reminderDate: '2026-05-05',
    },
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/future.md',
    title: 'Future',
    metadata: {
      reminderDate: '2026-05-05',
      reminderTime: '10:00',
      reminderAt: '2026-05-05T10:00:00.000Z',
    },
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/no-chat.md',
    title: 'No chat',
    workspaceSlug: 'no-chat',
    metadata: {
      reminderDate: '2026-05-05',
      reminderTime: '09:00',
      reminderAt: '2026-05-05T09:00:00.000Z',
    },
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/resolved.md',
    title: 'Resolved',
    status: 'resolved',
    metadata: {
      reminderDate: '2026-05-05',
      reminderTime: '09:00',
      reminderAt: '2026-05-05T09:00:00.000Z',
    },
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/archived.md',
    title: 'Archived',
    status: 'archived',
    metadata: {
      reminderDate: '2026-05-05',
      reminderTime: '09:00',
      reminderAt: '2026-05-05T09:00:00.000Z',
    },
  });
  const otherUserDue = await insertReminder(repositories, otherUser.id, {
    path: '20 Inbox/n8n-automations/other-user.md',
    title: 'Other user',
    metadata: {
      reminderDate: '2026-05-05',
      reminderTime: '08:45',
      reminderAt: '2026-05-05T08:45:00.000Z',
    },
  });

  const reminders = await repositories.contentQueryRepository.listDueTelegramReminders(now);

  assert.deepEqual(reminders.map((item) => item.reminderId), [otherUserDue.id, dateOnly.id, due.id]);
  assert.equal(reminders.some((item) => item.relativePath.endsWith('future.md')), false);
  assert.equal(reminders.some((item) => item.relativePath.endsWith('no-chat.md')), false);
  assert.equal(reminders.some((item) => item.relativePath.endsWith('resolved.md')), false);
  assert.equal(reminders.some((item) => item.relativePath.endsWith('archived.md')), false);

  const dateOnlyReminder = reminders.find((item) => item.reminderId === dateOnly.id);
  assert.equal(dateOnlyReminder?.scheduledAt, '2026-05-05T12:00:00.000Z');
  assert.equal(dateOnlyReminder?.telegramChatId, 'telegram-chat-1');
});

test('daily reminder dispatch ignores resolved and archived reminders even when overdue', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: 'telegram-chat-1',
    createdAt: '2026-05-05T00:00:00.000Z',
    updatedAt: '2026-05-05T00:00:00.000Z',
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/pending.md',
    title: 'Pending reminder',
    status: 'pending',
    metadata: {
      reminderDate: '2026-05-04',
      reminderTime: '09:00',
      reminderAt: '2026-05-04T09:00:00.000Z',
    },
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/resolved-overdue.md',
    title: 'Resolved overdue',
    status: 'resolved',
    metadata: {
      reminderDate: '2026-05-04',
      reminderTime: '09:00',
      reminderAt: '2026-05-04T09:00:00.000Z',
    },
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/archived-overdue.md',
    title: 'Archived overdue',
    status: 'archived',
    metadata: {
      reminderDate: '2026-05-04',
      reminderTime: '09:00',
      reminderAt: '2026-05-04T09:00:00.000Z',
    },
  });

  const useCase = new BuildReminderDispatchUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    environmentProvider(),
  );
  const result = await useCase.execute('daily', user.id, 'default', new Date('2026-05-05T12:00:00.000Z'));

  assert.equal(result.ok, true);
  assert.equal(result.shouldSend, true);
  assert.match(result.text, /Pending reminder/);
  assert.doesNotMatch(result.text, /Resolved overdue/);
  assert.doesNotMatch(result.text, /Archived overdue/);
});

test('direct telegram dispatch sends a due reminder and marks it as sent', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  const sent = [];
  const useCase = new DispatchDueTelegramRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    { sendText: async (input) => { sent.push(input); return { ok: true }; } },
    createLoggerStub(),
  );

  const result = await useCase.execute('2099-12-31T12:00:00.000Z');

  assert.equal(result.ok, true);
  assert.equal(result.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, 'telegram-chat-1');
  assert.match(sent[0].text, /^Lembrete\nProjeto: n8n-automations\nNota: Deploy\nAgendado para: 2099-12-31 12:00 UTC$/);
  assert.equal(await repositories.reminderDispatchRepository.hasSent(user.id, 'default', 'exact', '2099-12-31T12:00', '11111111-1111-1111-1111-111111111111'), true);
});

test('direct telegram dispatch sends overdue reminders only once using scheduled minute idempotency', async (t) => {
  const { repositories } = await createStoreWithReminder(t);
  const sent = [];
  const useCase = new DispatchDueTelegramRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    { sendText: async (input) => { sent.push(input); return { ok: true }; } },
    createLoggerStub(),
  );

  const first = await useCase.execute('2100-01-01T00:00:00.000Z');
  const second = await useCase.execute('2100-01-01T00:01:00.000Z');

  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.equal(second.skipped, 1);
  assert.equal(sent.length, 1);
});

test('direct telegram dispatch applies 09:00 fallback when reminder has only date', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappGroupJid: '',
    telegramChatId: 'telegram-chat-1',
    createdAt: '2026-05-05T00:00:00.000Z',
    updatedAt: '2026-05-05T00:00:00.000Z',
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/date-only.md',
    title: 'Date only',
    metadata: {
      reminderDate: '2026-05-05',
    },
  });

  const sent = [];
  const useCase = new DispatchDueTelegramRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    { sendText: async (input) => { sent.push(input); return { ok: true }; } },
    createLoggerStub(),
  );

  const before = await useCase.execute('2026-05-05T08:59:00.000Z');
  const after = await useCase.execute('2026-05-05T09:00:00.000Z');

  assert.equal(before.sent, 0);
  assert.equal(after.sent, 1);
  assert.match(sent[0].text, /Agendado para: 2026-05-05 09:00 UTC/);
});

test('direct telegram dispatch does not mark reminder as sent when telegram delivery fails', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  const errors = [];
  const useCase = new DispatchDueTelegramRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    { sendText: async () => ({ ok: false, error: 'telegram_api_http_500' }) },
    { ...createLoggerStub(), error(event, fields) { errors.push({ event, fields }); } },
  );

  const result = await useCase.execute('2099-12-31T12:00:00.000Z');

  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(errors.length, 1);
  assert.equal(await repositories.reminderDispatchRepository.hasSent(user.id, 'default', 'exact', '2099-12-31T12:00', '11111111-1111-1111-1111-111111111111'), false);
});

test('telegram reminder worker delegates to direct dispatch use case', async () => {
  let calls = 0;
  const worker = new TelegramReminderDispatchWorker(
    { execute: async () => { calls += 1; return { ok: true, sent: 0 }; } },
    createLoggerStub(),
    { read: () => ({ databaseUrl: 'postgres://test' }) },
  );

  const result = await worker.runOnce();

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
});

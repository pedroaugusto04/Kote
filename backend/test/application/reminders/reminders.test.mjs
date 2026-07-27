import test from 'node:test';
import assert from 'node:assert/strict';

import { BuildReminderDispatchUseCase, DispatchDueRemindersUseCase, DispatchDueTelegramRemindersUseCase, ListPaginatedRemindersUseCase, ListReminderBoardUseCase, MarkReminderAsSentUseCase, RefreshReminderStatusesUseCase, UpdateReminderStatusUseCase } from '../../../dist/application/use-cases/index.js';
import { ReminderDeliveryChannel, ReminderDispatchMode } from '../../../dist/contracts/enums.js';
import { formatReminderScheduledAtLabel, reminderDispatchKey } from '../../../dist/application/use-cases/reminders/reminder-schedule.js';
import { ReminderDispatchWorker } from '../../../dist/application/workers/reminder-dispatch.worker.js';
import { TelegramReminderDispatchWorker } from '../../../dist/application/workers/telegram-reminder-dispatch.worker.js';
import { createPostgresTestRepositories } from '../../helpers/postgres-test-repositories.mjs';

async function createStoreWithReminder(t) {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '120363-default@g.us',
    telegramChatId: 'telegram-chat-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await repositories.contentRepository.upsertProject(user.id, {
    projectSlug: 'n8n-automations',
    displayName: 'n8n-automations',
    workspaceSlug: 'default',
    repositories: [],
    defaultTags: [],
    enabled: true,
    favorite: false,
  });
  await repositories.contentRepository.upsertNote(user.id, {
    id: '11111111-1111-1111-1111-111111111111',
    path: '20 Inbox/n8n-automations/deploy.md',
    type: 'event',
    title: 'Deploy',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'pending',
    tags: [],
    occurredAt: '2099-12-31T12:00:00.000Z',
    sourceChannel: 'test',
    summary: 'Validar rollout antes da janela de deploy.',
    markdown: '',
    frontmatter: {},
    metadata: {
      rawText: 'Validar rollout antes da janela de deploy.',
      reminderDate: '2099-12-31',
      reminderTime: '09:00',
      reminderAt: '2099-12-31T12:00:00.000Z',
    },
    reminderDate: '2099-12-31',
    reminderAt: '2099-12-31T12:00:00.000Z',
    origin: 'postgres',
    source: 'test',
    links: [],
  });
  return { repositories, user };
}

async function insertReminder(repositories, userId, input) {
  const workspaceSlug = input.workspaceSlug || 'default';
  const ws = await repositories.contentRepository.getWorkspaceBySlug(userId, workspaceSlug);
  if (!ws) {
    await repositories.contentRepository.upsertWorkspace(userId, {
      workspaceSlug,
      displayName: workspaceSlug === 'default' ? 'Default' : workspaceSlug,
      whatsappChatJid: workspaceSlug === 'default' ? '120363-default@g.us' : '',
      telegramChatId: workspaceSlug === 'default' ? 'telegram-chat-1' : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const projectSlug = input.projectSlug || 'n8n-automations';
  const proj = await repositories.contentRepository.getProjectBySlug(userId, projectSlug);
  if (!proj) {
    await repositories.contentRepository.upsertProject(userId, {
      projectSlug,
      displayName: projectSlug,
      workspaceSlug,
      repositories: [],
      defaultTags: [],
      enabled: true,
      favorite: false,
    });
  }

  const rawText = input.rawText || input.title;
  return repositories.contentRepository.upsertNote(userId, {
    path: input.path,
    type: 'event',
    title: input.title,
    projectSlug,
    workspaceSlug,
    status: input.status || 'pending',
    tags: [],
    occurredAt: input.occurredAt || input.metadata.reminderAt || `${input.metadata.reminderDate}T00:00:00.000Z`,
    sourceChannel: 'test',
    summary: rawText,
    markdown: '',
    frontmatter: {},
    metadata: {
      rawText,
      ...input.metadata,
    },
    reminderDate: input.metadata.reminderDate || '',
    reminderAt: input.metadata.reminderAt || '',
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

function createEventBusStub() {
  return {
    emit() {},
  };
}

function environmentProvider(reminderTimeZone = 'America/Sao_Paulo') {
  return {
    read: () => ({ reminderTimeZone }),
  };
}

function createRefreshReminderStatuses(repositories) {
  return new RefreshReminderStatusesUseCase(
    repositories.contentRepository,
    repositories.reminderDispatchRepository,
    environmentProvider(),
  );
}

test('reminder scheduled label is displayed in Sao Paulo date-time format', () => {
  assert.equal(formatReminderScheduledAtLabel('2026-05-21T17:30:00.000Z'), '2026-05-21 14:30:00');
});

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
  const marker = new MarkReminderAsSentUseCase(repositories.reminderDispatchRepository, repositories.contentRepository);
  const result = await marker.execute(['11111111-1111-1111-1111-111111111111'], user.id, 'default', 'exact', '2099-12-31T12:00');

  assert.equal(result.ok, true);
  assert.equal(result.marked, 1);
  assert.equal(await repositories.reminderDispatchRepository.hasSent(user.id, 'default', 'exact', '2099-12-31T12:00', '11111111-1111-1111-1111-111111111111'), true);
  assert.equal((await repositories.contentRepository.getNoteById(user.id, '11111111-1111-1111-1111-111111111111'))?.status, 'sent');
});

test('paginated reminders expose derived sent state and overdue flag', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const listReminders = new ListPaginatedRemindersUseCase(repositories.contentQueryRepository, createRefreshReminderStatuses(repositories));

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

  assert.equal(expired?.status, 'overdue');
  assert.equal(expired?.isOverdue, true);
  assert.equal((await repositories.contentRepository.getNoteById(user.id, expiredReminder.id))?.status, 'overdue');
  assert.equal(sent?.status, 'sent');
  assert.equal(sent?.isOverdue, false);
  assert.equal((await repositories.contentRepository.getNoteById(user.id, sentReminder.id))?.status, 'sent');

  const sentOnly = await listReminders.execute(user.id, { page: 1, pageSize: 10, status: 'sent' });
  assert.deepEqual(sentOnly.items.map((item) => item.id), [sentReminder.id]);
});

test('paginated reminders sort all statuses with overdue and pending first then date ascending', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const listReminders = new ListPaginatedRemindersUseCase(repositories.contentQueryRepository, createRefreshReminderStatuses(repositories));

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

  const listed = await listReminders.execute(user.id, { page: 1, pageSize: 10, status: 'all' });

  assert.deepEqual(
    listed.items.map((item) => ({ title: item.title, status: item.status })),
    [
      { title: 'Pending earlier', status: 'pending' },
      { title: 'Pending later', status: 'pending' },
      { title: sentReminder.title, status: 'sent' },
      { title: archivedReminder.title, status: 'archived' },
    ],
  );
});

test('reminder board groups reminders by due state and terminal status with per-column limits', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const otherUser = await repositories.createTestUser();
  const listBoard = new ListReminderBoardUseCase(repositories.contentQueryRepository, createRefreshReminderStatuses(repositories));

  const overdue = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/overdue.md',
    title: 'Overdue reminder',
    metadata: {
      reminderDate: '2026-05-05',
      reminderTime: '09:00',
      reminderAt: '2026-05-05T09:00:00.000Z',
    },
  });
  const sent = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/sent.md',
    title: 'Sent reminder',
    metadata: {
      reminderDate: '2099-12-30',
      reminderTime: '09:00',
      reminderAt: '2099-12-30T09:00:00.000Z',
    },
  });
  await repositories.reminderDispatchRepository.markSent(
    user.id,
    'default',
    ReminderDispatchMode.Exact,
    reminderDispatchKey('2099-12-30T09:00:00.000Z'),
    sent.id,
  );
  const upcomingA = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/upcoming-a.md',
    title: 'Upcoming A',
    metadata: {
      reminderDate: '2099-12-31',
      reminderTime: '09:00',
      reminderAt: '2099-12-31T09:00:00.000Z',
    },
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/other-project/upcoming-b.md',
    title: 'Upcoming B',
    projectSlug: 'other-project',
    metadata: {
      reminderDate: '2099-12-31',
      reminderTime: '10:00',
      reminderAt: '2099-12-31T10:00:00.000Z',
    },
  });
  const resolved = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/resolved.md',
    title: 'Resolved reminder',
    status: 'resolved',
    metadata: {
      reminderDate: '2026-05-05',
      reminderTime: '08:00',
      reminderAt: '2026-05-05T08:00:00.000Z',
    },
  });
  const archived = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/archived.md',
    title: 'Archived reminder',
    status: 'archived',
    metadata: {
      reminderDate: '2026-05-05',
      reminderTime: '08:30',
      reminderAt: '2026-05-05T08:30:00.000Z',
    },
  });
  await insertReminder(repositories, otherUser.id, {
    path: '20 Inbox/n8n-automations/other-user.md',
    title: 'Other user reminder',
    metadata: {
      reminderDate: '2099-12-31',
      reminderTime: '09:00',
      reminderAt: '2099-12-31T09:00:00.000Z',
    },
  });

  const board = await listBoard.execute(user.id, { workspaceSlug: 'default', projectSlug: 'n8n-automations', limitPerColumn: 1, columnPage: { overdue: 1, upcoming: 1, resolved: 1, archived: 1 } });

  assert.equal(board.columns.overdue.total, 1);
  assert.deepEqual(board.columns.overdue.items.map((item) => item.id), [overdue.id]);
  assert.equal(board.columns.overdue.items[0].status, 'overdue');
  assert.equal((await repositories.contentRepository.getNoteById(user.id, overdue.id))?.status, 'overdue');
  assert.equal(board.columns.upcoming.total, 2);
  assert.deepEqual(board.columns.upcoming.items.map((item) => item.id), [upcomingA.id]);
  assert.equal(board.columns.upcoming.items[0].status, 'pending');
  assert.equal(board.columns.upcoming.items.some((item) => item.id === sent.id), false);
  assert.deepEqual(board.columns.resolved.items.map((item) => item.id), [resolved.id]);
  assert.deepEqual(board.columns.archived.items.map((item) => item.id), [archived.id]);
});

test('reminder status update reopens terminal reminders and remains isolated by user', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const otherUser = await repositories.createTestUser();
  const updateStatus = new UpdateReminderStatusUseCase(repositories.contentRepository);
  const reminder = await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/resolved.md',
    title: 'Resolved reminder',
    status: 'resolved',
    metadata: {
      reminderDate: '2099-12-31',
      reminderTime: '09:00',
      reminderAt: '2099-12-31T09:00:00.000Z',
    },
  });
  const plainNote = await repositories.contentRepository.upsertNote(user.id, {
    path: '20 Inbox/n8n-automations/plain.md',
    type: 'event',
    title: 'Plain',
    projectSlug: 'n8n-automations',
    workspaceSlug: 'default',
    status: 'active',
    tags: [],
    occurredAt: '2099-12-31T12:00:00.000Z',
    sourceChannel: 'test',
    summary: 'Plain note',
    markdown: '',
    frontmatter: {},
    metadata: {},
    origin: 'postgres',
    source: 'test',
    links: [],
  });

  assert.deepEqual(await updateStatus.execute(otherUser.id, { id: reminder.id, status: 'archived' }), { ok: false, reason: 'reminder_not_found' });
  assert.deepEqual(await updateStatus.execute(user.id, { id: plainNote.id, status: 'archived' }), { ok: false, reason: 'reminder_not_found' });
  assert.deepEqual(await updateStatus.execute(user.id, { id: reminder.id, status: 'pending' }), { ok: true, id: reminder.id, status: 'pending' });
  assert.equal((await repositories.contentRepository.getNoteById(user.id, reminder.id))?.status, 'pending');
});

test('global due reminder read model filters reminders by requested channel recipient', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  const otherUser = await repositories.createTestUser();
  const now = '2026-05-05T09:30:00.000Z';

  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '120363-default@g.us',
    telegramChatId: 'telegram-chat-1',
    createdAt: now,
    updatedAt: now,
  });
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'no-chat',
    displayName: 'No Chat',
    whatsappChatJid: '',
    telegramChatId: '',
    createdAt: now,
    updatedAt: now,
  });
  await repositories.contentRepository.upsertWorkspace(otherUser.id, {
    workspaceSlug: 'default',
    displayName: 'Other',
    whatsappChatJid: '120363-other@g.us',
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
      reminderAt: '2026-05-05T12:00:00.000Z',
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

  const reminders = await repositories.contentQueryRepository.listDueRemindersByChannel(ReminderDeliveryChannel.Whatsapp, now);

  assert.deepEqual(reminders.map((item) => item.reminderId), [otherUserDue.id, due.id]);
  assert.equal(reminders.some((item) => item.relativePath.endsWith('future.md')), false);
  assert.equal(reminders.some((item) => item.relativePath.endsWith('no-chat.md')), false);
  assert.equal(reminders.some((item) => item.relativePath.endsWith('resolved.md')), false);
  assert.equal(reminders.some((item) => item.relativePath.endsWith('archived.md')), false);

  const dateOnlyReminder = await repositories.contentQueryRepository.listDueRemindersByChannel(ReminderDeliveryChannel.Whatsapp, '2026-05-05T12:00:00.000Z');
  const resolvedDateOnlyReminder = dateOnlyReminder.find((item) => item.reminderId === dateOnly.id);
  assert.equal(resolvedDateOnlyReminder?.scheduledAt, '2026-05-05T12:00:00.000Z');
  assert.equal(resolvedDateOnlyReminder?.recipientId, '120363-default@g.us');
  assert.equal(resolvedDateOnlyReminder?.channel, ReminderDeliveryChannel.Whatsapp);
});

test('daily reminder dispatch ignores resolved and archived reminders even when overdue', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();
  await repositories.contentRepository.upsertWorkspace(user.id, {
    workspaceSlug: 'default',
    displayName: 'Default',
    whatsappChatJid: '',
    telegramChatId: 'telegram-chat-1',
    createdAt: '2026-05-05T00:00:00.000Z',
    updatedAt: '2026-05-05T00:00:00.000Z',
  });
  await insertReminder(repositories, user.id, {
    path: '20 Inbox/n8n-automations/pending.md',
    title: 'Pending reminder',
    rawText: 'Conferir a pendencia antes do fechamento.',
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
  assert.match(result.text, /Text: Conferir a pendencia antes do fechamento\./);
  assert.doesNotMatch(result.text, /Resolved overdue/);
  assert.doesNotMatch(result.text, /Archived overdue/);
});

test('default reminder dispatch sends a due WhatsApp reminder and marks it as sent', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  const sent = [];
  const markReminderAsSent = new MarkReminderAsSentUseCase(repositories.reminderDispatchRepository, repositories.contentRepository);
  const useCase = new DispatchDueRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    markReminderAsSent,
    { sendText: async (input) => { sent.push(input); return { ok: true }; } },
    createEventBusStub(),
    createLoggerStub(),
  );

  const result = await useCase.execute(ReminderDeliveryChannel.Whatsapp, '2099-12-31T12:00:00.000Z');

  assert.equal(result.ok, true);
  assert.equal(result.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].channel, ReminderDeliveryChannel.Whatsapp);
  assert.equal(sent[0].recipientId, '120363-default@g.us');
  assert.equal(sent[0].workspaceSlug, 'default');
  assert.equal(sent[0].userId, user.id);
  assert.match(sent[0].text, /^Reminder\nProject: n8n-automations\nNote: Deploy\n\nNote text:\nValidar rollout antes da janela de deploy\.\n\nScheduled for: 2099-12-31 09:00:00$/);
  assert.equal(await repositories.reminderDispatchRepository.hasSent(user.id, 'default', 'exact', '2099-12-31T12:00', '11111111-1111-1111-1111-111111111111'), true);
  assert.equal((await repositories.contentRepository.getNoteById(user.id, '11111111-1111-1111-1111-111111111111'))?.status, 'sent');
});

test('default reminder dispatch sends overdue reminders only once using scheduled minute idempotency', async (t) => {
  const { repositories } = await createStoreWithReminder(t);
  const sent = [];
  const markReminderAsSent = new MarkReminderAsSentUseCase(repositories.reminderDispatchRepository, repositories.contentRepository);
  const useCase = new DispatchDueRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    markReminderAsSent,
    { sendText: async (input) => { sent.push(input); return { ok: true }; } },
    createEventBusStub(),
    createLoggerStub(),
  );

  const first = await useCase.execute(ReminderDeliveryChannel.Whatsapp, '2100-01-01T00:00:00.000Z');
  const second = await useCase.execute(ReminderDeliveryChannel.Whatsapp, '2100-01-01T00:01:00.000Z');

  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.equal(second.skipped, 0);
  assert.equal(second.checked, 0);
  assert.equal(sent.length, 1);
});

test('telegram reminder dispatch use case remains compatible as an alternative adapter path', async (t) => {
  const { repositories } = await createStoreWithReminder(t);
  const sent = [];
  const markReminderAsSent = new MarkReminderAsSentUseCase(repositories.reminderDispatchRepository, repositories.contentRepository);
  const dispatchDueReminders = new DispatchDueRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    markReminderAsSent,
    { sendText: async (input) => { sent.push(input); return { ok: true }; } },
    createEventBusStub(),
    createLoggerStub(),
  );
  const useCase = new DispatchDueTelegramRemindersUseCase(dispatchDueReminders);

  const result = await useCase.execute('2099-12-31T12:00:00.000Z');

  assert.equal(result.sent, 1);
  assert.equal(sent[0].channel, ReminderDeliveryChannel.Telegram);
  assert.equal(sent[0].recipientId, 'telegram-chat-1');
});


test('default reminder dispatch does not mark reminder as sent when Evolution delivery fails', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  const errors = [];
  const markReminderAsSent = new MarkReminderAsSentUseCase(repositories.reminderDispatchRepository, repositories.contentRepository);
  const useCase = new DispatchDueRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    markReminderAsSent,
    { sendText: async () => ({ ok: false, error: 'evolution_api_http_500' }) },
    createEventBusStub(),
    { ...createLoggerStub(), error(event, fields) { errors.push({ event, fields }); } },
  );

  const result = await useCase.execute(ReminderDeliveryChannel.Whatsapp, '2099-12-31T12:00:00.000Z');

  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].event, 'reminder.dispatch_failed');
  assert.equal(errors[0].fields.channel, ReminderDeliveryChannel.Whatsapp);
  assert.equal(await repositories.reminderDispatchRepository.hasSent(user.id, 'default', 'exact', '2099-12-31T12:00', '11111111-1111-1111-1111-111111111111'), false);
});

test('default reminder dispatch backs off failed deliveries before retrying', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  let deliveryCalls = 0;
  const markReminderAsSent = new MarkReminderAsSentUseCase(repositories.reminderDispatchRepository, repositories.contentRepository);
  const useCase = new DispatchDueRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    markReminderAsSent,
    { sendText: async () => { deliveryCalls += 1; return { ok: false, error: 'evolution_api_http_500' }; } },
    createEventBusStub(),
    createLoggerStub(),
  );

  const first = await useCase.execute(ReminderDeliveryChannel.Whatsapp, '2099-12-31T12:00:00.000Z');
  const second = await useCase.execute(ReminderDeliveryChannel.Whatsapp, '2099-12-31T12:00:30.000Z');
  const retryState = await repositories.reminderDispatchRepository.getRetryState({
    userId: user.id,
    workspaceSlug: 'default',
    mode: ReminderDispatchMode.Exact,
    dispatchKey: '2099-12-31T12:00',
    reminderId: '11111111-1111-1111-1111-111111111111',
    channel: ReminderDeliveryChannel.Whatsapp,
  });

  assert.equal(first.failed, 1);
  assert.equal(second.sent, 0);
  assert.equal(second.failed, 0);
  assert.equal(second.delayed, 1);
  assert.equal(deliveryCalls, 1);
  assert.ok(retryState);
  assert.equal(retryState?.attemptCount, 1);
  assert.ok(Date.parse(retryState.nextRetryAt) > Date.parse('2099-12-31T12:00:30.000Z'));
});

test('default reminder dispatch stops retrying after five failed attempts', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  const retryKey = {
    userId: user.id,
    workspaceSlug: 'default',
    mode: ReminderDispatchMode.Exact,
    dispatchKey: '2099-12-31T12:00',
    reminderId: '11111111-1111-1111-1111-111111111111',
    channel: ReminderDeliveryChannel.Whatsapp,
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await repositories.reminderDispatchRepository.recordFailure({
      ...retryKey,
      nextRetryAt: '2099-12-31T12:00:00.000Z',
      error: 'evolution_api_http_500',
    });
  }

  let deliveryCalls = 0;
  const markReminderAsSent = new MarkReminderAsSentUseCase(repositories.reminderDispatchRepository, repositories.contentRepository);
  const useCase = new DispatchDueRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    markReminderAsSent,
    { sendText: async () => { deliveryCalls += 1; return { ok: false, error: 'evolution_api_http_500' }; } },
    createEventBusStub(),
    createLoggerStub(),
  );

  const fifthAttempt = await useCase.execute(ReminderDeliveryChannel.Whatsapp, '2099-12-31T12:01:00.000Z');
  const afterLimit = await useCase.execute(ReminderDeliveryChannel.Whatsapp, '2099-12-31T13:01:00.000Z');
  const retryState = await repositories.reminderDispatchRepository.getRetryState(retryKey);

  assert.equal(fifthAttempt.failed, 1);
  assert.equal(afterLimit.failed, 0);
  assert.equal(afterLimit.exhausted, 1);
  assert.equal(afterLimit.skipped, 1);
  assert.equal(deliveryCalls, 1);
  assert.ok(retryState);
  assert.equal(retryState?.attemptCount, 5);
  assert.equal(retryState?.nextRetryAt, '');
  assert.equal(await repositories.reminderDispatchRepository.hasSent(user.id, 'default', 'exact', '2099-12-31T12:00', '11111111-1111-1111-1111-111111111111'), false);
});

test('default reminder worker delegates to WhatsApp dispatch channel', async () => {
  const calls = [];
  const worker = new ReminderDispatchWorker(
    { execute: async (...args) => { calls.push(args); return { ok: true, sent: 0 }; } },
    createLoggerStub(),
    { read: () => ({ databaseUrl: 'postgres://test' }) },
  );

  const result = await worker.runOnce();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [ReminderDeliveryChannel.Whatsapp]);
  assert.equal(result.ok, true);
});

test('telegram reminder worker delegates to telegram dispatch channel', async () => {
  let calls = 0;
  const worker = new TelegramReminderDispatchWorker(
    { execute: async (channel) => { calls += 1; assert.equal(channel, ReminderDeliveryChannel.Telegram); return { ok: true, sent: 0 }; } },
    createLoggerStub(),
    { read: () => ({ databaseUrl: 'postgres://test' }) },
  );

  const result = await worker.runOnce();

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
});

import { ReminderEventBus } from '../../../dist/application/event-buses/reminder-event.bus.js';

test('reminder dispatch emits reminder.sent event on successful delivery', async (t) => {
  const { repositories, user } = await createStoreWithReminder(t);
  const sent = [];
  const emittedEvents = [];
  const eventBus = new ReminderEventBus();

  eventBus.on('reminder.sent', (event) => {
    emittedEvents.push(event);
  });

  const markReminderAsSent = new MarkReminderAsSentUseCase(repositories.reminderDispatchRepository, repositories.contentRepository);
  const useCase = new DispatchDueRemindersUseCase(
    repositories.contentQueryRepository,
    repositories.reminderDispatchRepository,
    markReminderAsSent,
    { sendText: async (input) => { sent.push(input); return { ok: true }; } },
    eventBus,
    createLoggerStub(),
  );

  const result = await useCase.execute(ReminderDeliveryChannel.Whatsapp, '2099-12-31T12:00:00.000Z');

  assert.equal(result.sent, 1);
  assert.equal(emittedEvents.length, 1);
  assert.equal(emittedEvents[0].userId, user.id);
  assert.equal(emittedEvents[0].channel, ReminderDeliveryChannel.Whatsapp);
  assert.equal(emittedEvents[0].noteTitle, 'Deploy');
  assert.equal(emittedEvents[0].noteId, '11111111-1111-1111-1111-111111111111');
});


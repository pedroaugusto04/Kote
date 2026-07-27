import test from 'node:test';
import assert from 'node:assert/strict';
import { ReminderEventBus } from '../../../dist/application/event-buses/reminder-event.bus.js';
import { TelegramReminderListener } from '../../../dist/application/listeners/telegram-reminder.listener.js';
import { ReminderDeliveryChannel } from '../../../dist/contracts/enums.js';

test('TelegramReminderListener sends telegram message when WhatsApp reminder is sent', async () => {
  const eventBus = new ReminderEventBus();
  const telegramCalls = [];
  const telegramSenderMock = {
    async sendText(input) {
      telegramCalls.push(input);
      return { ok: true };
    },
  };

  const envProviderMock = {
    read() {
      return {
        publicBaseUrl: 'https://example.com',
        telegramChatId: '123456789',
      };
    },
  };

  const loggerMock = {
    error() {},
    warn() {},
    info() {},
    debug() {},
  };

  const contentRepositoryMock = {
    async listWorkspaces() {
      return [];
    },
  };
  const credentialsRepositoryMock = {
    async findCredential() {
      return null;
    },
  };

  const listener = new TelegramReminderListener(
    eventBus,
    telegramSenderMock,
    envProviderMock,
    loggerMock,
    contentRepositoryMock,
    credentialsRepositoryMock,
  );
  listener.onModuleInit();

  // 1. Emit an event for Whatsapp channel
  eventBus.emit('reminder.sent', {
    userId: 'user-1',
    workspaceSlug: 'default',
    channel: ReminderDeliveryChannel.Whatsapp,
    noteTitle: 'Reunião',
    project: 'Work',
    text: 'Preparar slides.',
    noteId: 'some-note-id',
  });

  // 2. Emit an event for Telegram channel (should be ignored by listener to avoid duplicates)
  eventBus.emit('reminder.sent', {
    userId: 'user-1',
    workspaceSlug: 'default',
    channel: ReminderDeliveryChannel.Telegram,
    noteTitle: 'Festa',
    project: 'Personal',
    text: 'Trazer bolo.',
  });

  // Wait a tick for async handler to run
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(telegramCalls.length, 1);
  assert.equal(telegramCalls[0].chatId, '123456789');
  assert.match(telegramCalls[0].text, /🔔 Lembrete: Reunião/);
  assert.match(telegramCalls[0].text, /Projeto: Work/);
  assert.match(telegramCalls[0].text, /Preparar slides\./);
  assert.match(telegramCalls[0].text, /🔗 Link: https:\/\/example\.com\/vault\/some-note-id/);
});

test('TelegramReminderListener does not send telegram message when Telegram integration is revoked', async () => {
  const eventBus = new ReminderEventBus();
  const telegramCalls = [];
  const telegramSenderMock = {
    async sendText(input) {
      telegramCalls.push(input);
      return { ok: true };
    },
  };

  const envProviderMock = {
    read() {
      return {
        publicBaseUrl: 'https://example.com',
        telegramChatId: '123456789',
      };
    },
  };

  const loggerMock = {
    error() {},
    warn() {},
    info() {},
    debug() {},
  };

  const contentRepositoryMock = {
    async listWorkspaces() {
      return [];
    },
  };
  const credentialsRepositoryMock = {
    async findCredential() {
      return {
        status: 'revoked',
        revokedAt: new Date().toISOString(),
      };
    },
  };

  const listener = new TelegramReminderListener(
    eventBus,
    telegramSenderMock,
    envProviderMock,
    loggerMock,
    contentRepositoryMock,
    credentialsRepositoryMock,
  );
  listener.onModuleInit();

  eventBus.emit('reminder.sent', {
    userId: 'user-1',
    workspaceSlug: 'default',
    channel: ReminderDeliveryChannel.Whatsapp,
    noteTitle: 'Reunião',
    project: 'Work',
    text: 'Preparar slides.',
    noteId: 'some-note-id',
  });

  // Wait a tick for async handler to run
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(telegramCalls.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ReminderEventBus } from '../../../dist/application/services/reminder-event.bus.js';
import { PushNotificationReminderListener } from '../../../dist/application/services/push-notification-reminder.listener.js';
import { ReminderDeliveryChannel } from '../../../dist/contracts/enums.js';

test('PushNotificationReminderListener sends push notification when WhatsApp reminder is sent', async () => {
  const eventBus = new ReminderEventBus();
  const pushCalls = [];
  const pushServiceMock = {
    async sendToUser(userId, payload) {
      pushCalls.push({ userId, payload });
    },
  };
  const envProviderMock = {
    read() {
      return { publicBaseUrl: 'https://example.com' };
    },
  };

  const loggerMock = {
    error() {},
    warn() {},
    info() {},
    debug() {},
  };

  const listener = new PushNotificationReminderListener(eventBus, pushServiceMock, envProviderMock, loggerMock);
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

  // 2. Emit an event for Telegram channel (should be ignored by push listener)
  eventBus.emit('reminder.sent', {
    userId: 'user-1',
    workspaceSlug: 'default',
    channel: ReminderDeliveryChannel.Telegram,
    noteTitle: 'Festa',
    project: 'Personal',
    text: 'Trazer bolo.',
  });

  assert.equal(pushCalls.length, 1);
  assert.equal(pushCalls[0].userId, 'user-1');
  assert.equal(pushCalls[0].payload.title, 'Lembrete: Reunião');
  assert.equal(pushCalls[0].payload.body, '[Work] Preparar slides.');
  assert.equal(pushCalls[0].payload.url, 'https://example.com/vault/some-note-id');
});

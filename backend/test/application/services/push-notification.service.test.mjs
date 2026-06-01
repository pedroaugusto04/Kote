import test from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import { PushNotificationService } from '../../../dist/application/services/push-notification.service.js';

test('PushNotificationService sends push notifications and deletes expired subscriptions on 410 Gone', async () => {
  const originalSetVapidDetails = webpush.setVapidDetails;
  const originalSendNotification = webpush.sendNotification;

  const setVapidCalls = [];
  const sendNotificationCalls = [];

  webpush.setVapidDetails = (mailto, pubKey, privKey) => {
    setVapidCalls.push({ mailto, pubKey, privKey });
  };

  webpush.sendNotification = async (sub, payload) => {
    sendNotificationCalls.push({ sub, payload });
    if (sub.endpoint === 'http://expired.endpoint') {
      const err = new Error('Subscription expired');
      err.statusCode = 410;
      throw err;
    }
    return { statusCode: 201 };
  };

  const deletedEndpoints = [];
  const mockRepo = {
    async listByUserId(userId) {
      return [
        { endpoint: 'http://valid.endpoint', p256dh: 'dh1', auth: 'auth1' },
        { endpoint: 'http://expired.endpoint', p256dh: 'dh2', auth: 'auth2' },
      ];
    },
    async deleteByEndpoint(userId, endpoint) {
      deletedEndpoints.push({ userId, endpoint });
    },
  };

  const mockVapid = {
    getPublicKey() { return 'pub'; },
    getPrivateKey() { return 'priv'; },
  };

  const mockLogger = {
    warn() {},
    error() {},
  };

  const service = new PushNotificationService(mockRepo, mockVapid, mockLogger);
  await service.sendToUser('user-123', { title: 'Test Title', body: 'Test Body', url: '/test-url' });

  assert.equal(setVapidCalls.length, 1);
  assert.equal(setVapidCalls[0].pubKey, 'pub');
  assert.equal(setVapidCalls[0].privKey, 'priv');

  assert.equal(sendNotificationCalls.length, 2);
  assert.equal(sendNotificationCalls[0].sub.endpoint, 'http://valid.endpoint');
  assert.equal(sendNotificationCalls[1].sub.endpoint, 'http://expired.endpoint');

  assert.equal(deletedEndpoints.length, 1);
  assert.equal(deletedEndpoints[0].userId, 'user-123');
  assert.equal(deletedEndpoints[0].endpoint, 'http://expired.endpoint');

  // Restore originals
  webpush.setVapidDetails = originalSetVapidDetails;
  webpush.sendNotification = originalSendNotification;
});

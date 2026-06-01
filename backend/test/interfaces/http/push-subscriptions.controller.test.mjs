import test from 'node:test';
import assert from 'node:assert/strict';
import { PushSubscriptionsController } from '../../../dist/interfaces/http/controllers/push/push-subscriptions.controller.js';

test('push subscriptions controller delegates subscribe, list and unsubscribe to use cases', async () => {
  const calls = [];
  const user = { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' };

  const listUseCase = {
    execute: async (userId) => {
      calls.push(['list', userId]);
      return [{ id: 'sub-1', userId, endpoint: 'https://updates.push.com/123', p256dh: 'p256', auth: 'auth-key' }];
    }
  };

  const createUseCase = {
    execute: async (userId, input) => {
      calls.push(['create', userId, input]);
      return { id: 'sub-1', userId, ...input };
    }
  };

  const deleteUseCase = {
    execute: async (userId, endpoint) => {
      calls.push(['delete', userId, endpoint]);
      return { ok: true };
    }
  };

  const vapidService = { getPublicKey: () => 'public-key' };
  const controller = new PushSubscriptionsController(listUseCase, createUseCase, deleteUseCase, vapidService);

  // Test Public Key
  const pkResult = await controller.getPublicKey();
  assert.deepEqual(pkResult, { publicKey: 'public-key' });

  // Test List
  const listResult = await controller.list(user);
  assert.deepEqual(listResult, [{ id: 'sub-1', userId: 'user-1', endpoint: 'https://updates.push.com/123', p256dh: 'p256', auth: 'auth-key' }]);

  // Test Create
  const createResult = await controller.create({
    endpoint: 'https://updates.push.com/123',
    p256dh: 'p256',
    auth: 'auth-key'
  }, user);
  assert.deepEqual(createResult, { id: 'sub-1', userId: 'user-1', endpoint: 'https://updates.push.com/123', p256dh: 'p256', auth: 'auth-key' });

  // Test Delete
  const deleteResult = await controller.remove({
    endpoint: 'https://updates.push.com/123'
  }, user);
  assert.deepEqual(deleteResult, { ok: true });

  // Assert expected use case calls
  assert.deepEqual(calls, [
    ['list', 'user-1'],
    ['create', 'user-1', { endpoint: 'https://updates.push.com/123', p256dh: 'p256', auth: 'auth-key' }],
    ['delete', 'user-1', 'https://updates.push.com/123']
  ]);
});

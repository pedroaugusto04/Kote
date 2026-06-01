import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

test('PostgresPushSubscriptionRepository saves, lists, finds, and deletes push subscriptions', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const user = await repositories.createTestUser();

  // 1. Initially user has no subscriptions
  const initialSubs = await repositories.pushSubscriptionRepository.listByUserId(user.id);
  assert.equal(initialSubs.length, 0);

  // 2. Save a subscription
  const sub = await repositories.pushSubscriptionRepository.save({
    userId: user.id,
    endpoint: 'https://updates.push.com/device123',
    p256dh: 'p256dh-key',
    auth: 'auth-key',
  });

  assert.ok(sub.id);
  assert.equal(sub.userId, user.id);
  assert.equal(sub.endpoint, 'https://updates.push.com/device123');
  assert.equal(sub.p256dh, 'p256dh-key');
  assert.equal(sub.auth, 'auth-key');
  assert.ok(sub.createdAt);
  assert.ok(sub.updatedAt);

  // 3. List subscriptions should return it
  const listSubs = await repositories.pushSubscriptionRepository.listByUserId(user.id);
  assert.equal(listSubs.length, 1);
  assert.equal(listSubs[0].id, sub.id);

  // 4. Find by endpoint
  const found = await repositories.pushSubscriptionRepository.findByEndpoint('https://updates.push.com/device123');
  assert.ok(found);
  assert.equal(found.id, sub.id);

  // 5. Update subscription (Upsert on conflict endpoint)
  const updatedSub = await repositories.pushSubscriptionRepository.save({
    userId: user.id,
    endpoint: 'https://updates.push.com/device123',
    p256dh: 'new-p256dh-key',
    auth: 'new-auth-key',
  });
  assert.equal(updatedSub.id, sub.id);
  assert.equal(updatedSub.p256dh, 'new-p256dh-key');
  assert.equal(updatedSub.auth, 'new-auth-key');

  // 6. Delete subscription
  const deleteResult = await repositories.pushSubscriptionRepository.deleteByEndpoint(user.id, 'https://updates.push.com/device123');
  assert.equal(deleteResult, true);

  // 7. Find should now return null
  const foundAfterDelete = await repositories.pushSubscriptionRepository.findByEndpoint('https://updates.push.com/device123');
  assert.equal(foundAfterDelete, null);
});

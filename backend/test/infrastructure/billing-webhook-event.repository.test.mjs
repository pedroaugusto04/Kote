import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { PostgresBillingWebhookEventRepository } from '../../dist/infrastructure/repositories/billing.repository.js';
import { createPostgresTestRepositories } from '../helpers/postgres-test-repositories.mjs';

test('PostgresBillingWebhookEventRepository.markWebhookEventAlerted appends alert marker without 42P18 parameter type error', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const webhookEventRepo = new PostgresBillingWebhookEventRepository(repositories.database);

  const created = await webhookEventRepo.createWebhookEventOnce({
    gateway: 'asaas',
    dedupKey: 'test-dedup-key-alerted',
    eventType: 'PAYMENT_RECEIVED',
    payload: { id: 'evt-1' },
  });
  assert.ok(created.id);

  // 1. Mark failed with an initial error
  await webhookEventRepo.markWebhookEventFailed(created.id, 'Connection timed out');
  const failedEvent = await webhookEventRepo.getWebhookEventById(created.id);
  assert.equal(failedEvent.lastError, 'Connection timed out');

  // 2. Mark alerted - should append marker successfully without Postgres 42P18 error
  const alertMarker = '[OUTBOX_ATTEMPT_LIMIT_ALERT_SENT]';
  await webhookEventRepo.markWebhookEventAlerted(created.id, alertMarker);

  const alertedEvent = await webhookEventRepo.getWebhookEventById(created.id);
  assert.ok(alertedEvent.lastError.includes('Connection timed out'));
  assert.ok(alertedEvent.lastError.includes(alertMarker));
});

test('PostgresBillingWebhookEventRepository.markWebhookEventAlerted works when lastError is null', async (t) => {
  const repositories = await createPostgresTestRepositories(t);
  const webhookEventRepo = new PostgresBillingWebhookEventRepository(repositories.database);

  const created = await webhookEventRepo.createWebhookEventOnce({
    gateway: 'asaas',
    dedupKey: 'test-dedup-key-null-error',
    eventType: 'PAYMENT_RECEIVED',
    payload: { id: 'evt-2' },
  });
  assert.ok(created.id);

  const alertMarker = '[OUTBOX_ATTEMPT_LIMIT_ALERT_SENT]';
  await webhookEventRepo.markWebhookEventAlerted(created.id, alertMarker);

  const alertedEvent = await webhookEventRepo.getWebhookEventById(created.id);
  assert.ok(alertedEvent.lastError.includes(alertMarker));
});

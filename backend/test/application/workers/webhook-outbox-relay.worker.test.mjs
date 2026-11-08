import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { WebhookOutboxRelayWorker } from '../../../dist/application/workers/webhook-outbox-relay.worker.js';

test('WebhookOutboxRelayWorker skips overlapping execution and handles db errors gracefully', async () => {
  let listCalls = 0;
  let errorLogged = false;

  const mockRepo = {
    listWebhookEventsForReplay: async () => {
      listCalls++;
      // Simulate delay to test concurrency guard
      await new Promise((resolve) => setTimeout(resolve, 50));
      return [];
    },
    listWebhookEventsAtAttemptLimit: async () => [],
    markWebhookEventDispatched: async () => {},
    markWebhookEventAlerted: async () => {},
  };

  const mockPublisher = {
    publishWebhookEventId: async () => {},
  };

  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {
      errorLogged = true;
    },
  };

  const worker = new WebhookOutboxRelayWorker(
    mockRepo,
    mockPublisher,
    mockLogger,
  );

  // 1. Concurrency guard test: run two jobs simultaneously
  const [job1, job2] = await Promise.all([
    worker.runWebhookOutboxRelayJob(),
    worker.runWebhookOutboxRelayJob(),
  ]);

  // Only one should have called listWebhookEventsForReplay
  assert.equal(listCalls, 1);

  // 2. Error handling test: repo throws connection timeout error
  mockRepo.listWebhookEventsForReplay = async () => {
    throw new Error('timeout exceeded when trying to connect');
  };

  // Should not throw unhandled exception
  await assert.doesNotReject(async () => {
    await worker.runWebhookOutboxRelayJob();
  });
  assert.equal(errorLogged, true);

  // Worker should be ready for next job after error (isRunning reset in finally)
  assert.equal(worker.isRunning, false);
});

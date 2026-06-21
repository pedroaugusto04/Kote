import test from 'node:test';
import assert from 'node:assert/strict';

import { AsaasWebhookController } from '../../dist/interfaces/http/controllers/billing/asaas-webhook.controller.js';
import { HandleAsaasWebhookUseCase } from '../../dist/application/use-cases/index.js';

test('AsaasWebhookController rejects requests if ASAAS_WEBHOOK_TOKEN is not configured', async () => {
  const originalToken = process.env.ASAAS_WEBHOOK_TOKEN;
  delete process.env.ASAAS_WEBHOOK_TOKEN;

  const mockRepo = {};
  const mockPublisher = {};
  const useCase = new HandleAsaasWebhookUseCase(mockRepo, mockPublisher);
  const controller = new AsaasWebhookController(useCase);

  await assert.rejects(
    () => controller.handleWebhook({ id: 'evt_1' }, { 'asaas-access-token': 'any-token' }),
    { name: 'UnauthorizedException', message: 'Unauthorized webhook' }
  );

  process.env.ASAAS_WEBHOOK_TOKEN = originalToken;
});

test('AsaasWebhookController rejects requests with invalid or missing tokens', async () => {
  process.env.ASAAS_WEBHOOK_TOKEN = 'secure-webhook-token';

  const mockRepo = {};
  const mockPublisher = {};
  const useCase = new HandleAsaasWebhookUseCase(mockRepo, mockPublisher);
  const controller = new AsaasWebhookController(useCase);

  // Missing token
  await assert.rejects(
    () => controller.handleWebhook({ id: 'evt_1' }, {}),
    { name: 'UnauthorizedException', message: 'Unauthorized webhook' }
  );

  // Invalid token
  await assert.rejects(
    () => controller.handleWebhook({ id: 'evt_1' }, { 'asaas-access-token': 'wrong-token' }),
    { name: 'UnauthorizedException', message: 'Unauthorized webhook' }
  );
});

test('AsaasWebhookController accepts correct token, saves event, and publishes to queue', async () => {
  process.env.ASAAS_WEBHOOK_TOKEN = 'secure-webhook-token';

  let createdEventParams = null;
  const mockRepo = {
    createWebhookEventOnce: async (params) => {
      createdEventParams = params;
      return { id: 'local-event-uuid-1', created: true, status: 'pending' };
    }
  };

  let publishedEventId = null;
  const mockPublisher = {
    publishWebhookEventId: async (id) => {
      publishedEventId = id;
    }
  };

  const useCase = new HandleAsaasWebhookUseCase(mockRepo, mockPublisher);
  const controller = new AsaasWebhookController(useCase);

  const payload = {
    id: 'evt_asaas_123',
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: 'pay_123',
      subscription: 'sub_456'
    }
  };

  const response = await controller.handleWebhook(payload, { 'asaas-access-token': 'secure-webhook-token' });

  assert.deepEqual(response, { success: true });
  assert.equal(publishedEventId, 'local-event-uuid-1');
  assert.ok(createdEventParams);
  assert.equal(createdEventParams.gateway, 'asaas');
  assert.equal(createdEventParams.dedupKey, 'evt_asaas_123');
  assert.equal(createdEventParams.eventType, 'PAYMENT_RECEIVED');
  assert.equal(createdEventParams.gatewayPaymentId, 'pay_123');
  assert.equal(createdEventParams.gatewaySubscriptionId, 'sub_456');
  assert.deepEqual(createdEventParams.payload, payload);
});

test('AsaasWebhookController handles duplicate events gracefully without republishing', async () => {
  process.env.ASAAS_WEBHOOK_TOKEN = 'secure-webhook-token';

  const mockRepo = {
    createWebhookEventOnce: async () => {
      // Event already processed to 'done' state
      return { id: 'local-event-uuid-2', created: false, status: 'done' };
    }
  };

  let published = false;
  const mockPublisher = {
    publishWebhookEventId: async () => {
      published = true;
    }
  };

  const useCase = new HandleAsaasWebhookUseCase(mockRepo, mockPublisher);
  const controller = new AsaasWebhookController(useCase);

  const response = await controller.handleWebhook(
    { id: 'evt_asaas_123', event: 'PAYMENT_RECEIVED' },
    { 'asaas-access-token': 'secure-webhook-token' }
  );

  assert.deepEqual(response, { success: true, duplicated: true });
  assert.equal(published, false);
});

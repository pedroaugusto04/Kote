import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  verifyStripeWebhookSignature,
  extractStripeEventIds,
  buildStripeDedupKey,
} from '../../../../dist/application/utils/webhook/stripe-webhook.utils.js';

test('verifyStripeWebhookSignature verifies valid Stripe signature correctly', () => {
  const secret = 'whsec_test_secret_123';
  const payload = '{"type":"invoice.paid","id":"in_123"}';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const header = `t=${timestamp},v1=${signature}`;

  assert.equal(verifyStripeWebhookSignature(payload, header, secret), true);
});

test('verifyStripeWebhookSignature rejects invalid signatures or malformed headers', () => {
  const secret = 'whsec_test_secret_123';
  assert.equal(verifyStripeWebhookSignature('{}', 'malformed_header', secret), false);
  assert.equal(verifyStripeWebhookSignature('{}', 't=123,v1=wrongsignature', secret), false);
});

test('extractStripeEventIds extracts payment and subscription ids from stripe event payload', () => {
  const invoiceEvent = {
    data: {
      object: {
        id: 'in_999',
        subscription: 'sub_888',
      },
    },
  };
  const result = extractStripeEventIds(invoiceEvent, 'invoice.payment_succeeded');
  assert.equal(result.gatewayPaymentId, 'in_999');
  assert.equal(result.gatewaySubscriptionId, 'sub_888');

  const customerEvent = {
    data: {
      object: {
        id: 'cus_111',
      },
    },
  };
  const customerResult = extractStripeEventIds(customerEvent, 'customer.created');
  assert.equal(customerResult.gatewayPaymentId, null);
  assert.equal(customerResult.gatewaySubscriptionId, null);
});

test('buildStripeDedupKey returns gatewayEventId when present or sha256 of payload', () => {
  assert.equal(buildStripeDedupKey({}, 'evt_custom'), 'evt_custom');
  const body = { hello: 'world' };
  const expectedHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  assert.equal(buildStripeDedupKey(body, null), expectedHash);
});

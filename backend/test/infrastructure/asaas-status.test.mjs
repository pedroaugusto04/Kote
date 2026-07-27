import test from 'node:test';
import assert from 'node:assert/strict';

import { AsaasGatewayStatusMapper } from '../../dist/infrastructure/billing/gateways/asaas/AsaasGatewayStatusMapper.js';

test('AsaasGatewayStatusMapper normalizeSubscriptionStatus maps known statuses', () => {
  const mapper = new AsaasGatewayStatusMapper();
  assert.equal(mapper.normalizeSubscriptionStatus('ACTIVE'), 'active');
  assert.equal(mapper.normalizeSubscriptionStatus('inactive'), 'inactive');
  assert.equal(mapper.normalizeSubscriptionStatus('DELETED'), 'canceled');
  assert.equal(mapper.normalizeSubscriptionStatus('CANCELED'), 'canceled');
});

test('AsaasGatewayStatusMapper normalizeSubscriptionStatus returns null when status is unknown', () => {
  const mapper = new AsaasGatewayStatusMapper();
  assert.equal(mapper.normalizeSubscriptionStatus('???'), null);
  assert.equal(mapper.normalizeSubscriptionStatus(null), null);
  assert.equal(mapper.normalizeSubscriptionStatus(), null);
});

test('AsaasGatewayStatusMapper normalizePaymentStatus maps known payment statuses', () => {
  const mapper = new AsaasGatewayStatusMapper();
  assert.equal(mapper.normalizePaymentStatus('DELETED', null), 'canceled');
  assert.equal(mapper.normalizePaymentStatus('RECEIVED', null), 'received');
  assert.equal(mapper.normalizePaymentStatus('RECEIVED_IN_CASH', null), 'received');
  assert.equal(mapper.normalizePaymentStatus('CONFIRMED', null), 'confirmed');
  assert.equal(mapper.normalizePaymentStatus('PENDING', null), 'pending');
  assert.equal(mapper.normalizePaymentStatus('OVERDUE', null), 'overdue');
  assert.equal(mapper.normalizePaymentStatus('CANCELED', null), 'canceled');
  assert.equal(mapper.normalizePaymentStatus('REFUNDED', null), 'refunded');
  assert.equal(mapper.normalizePaymentStatus('PARTIALLY_REFUNDED', null), 'partially_refunded');
  assert.equal(mapper.normalizePaymentStatus('REFUND_REQUESTED', null), 'refunded');
  assert.equal(mapper.normalizePaymentStatus('REFUND_IN_PROGRESS', null), 'refunded');
  assert.equal(mapper.normalizePaymentStatus('CHARGEBACK_REQUESTED', null), 'refunded');
  assert.equal(mapper.normalizePaymentStatus('CHARGEBACK_DISPUTE', null), 'refunded');
  assert.equal(mapper.normalizePaymentStatus('AWAITING_CHARGEBACK_REVERSAL', null), 'refunded');
});

test('AsaasGatewayStatusMapper normalizePaymentStatus prioritizes delete/cancel/refund events', () => {
  const mapper = new AsaasGatewayStatusMapper();
  assert.equal(mapper.normalizePaymentStatus('PENDING', 'PAYMENT_DELETE'), 'canceled');
  assert.equal(mapper.normalizePaymentStatus(null, 'PAYMENT_DELETED'), 'canceled');
  assert.equal(mapper.normalizePaymentStatus('CONFIRMED', 'PAYMENT_REFUNDED'), 'refunded');
});

test('AsaasGatewayStatusMapper normalizePaymentStatus returns null for unknown status', () => {
  const mapper = new AsaasGatewayStatusMapper();
  assert.equal(mapper.normalizePaymentStatus('UNKNOWN', 'PAYMENT_CONFIRMED'), null);
  assert.equal(mapper.normalizePaymentStatus(null, null), null);
});

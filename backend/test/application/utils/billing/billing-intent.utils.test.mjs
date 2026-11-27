import test from 'node:test';
import assert from 'node:assert/strict';
import { BillingRuleException } from '../../../../dist/domain/exceptions/index.js';

import {
  buildExternalReference,
  parseExternalReference,
} from '../../../../dist/application/utils/billing/billing-intent.utils.js';

test('buildExternalReference serializes type and billingIntentId into url query string', () => {
  const ref = buildExternalReference('new', 'intent-123');
  assert.equal(ref, 't=new&id=intent-123');
});

test('buildExternalReference validates presence of type and billingIntentId', () => {
  assert.throws(() => buildExternalReference('', 'intent-123'), /type is required/);
  assert.throws(() => buildExternalReference('new', ''), /billingIntentId is required/);
});

test('parseExternalReference parses valid external reference query string', () => {
  const parsed = parseExternalReference('t=upgrade&id=intent-456');
  assert.deepEqual(parsed, {
    type: 'upgrade',
    billingIntentId: 'intent-456',
  });
});

test('parseExternalReference throws BillingRuleException when reference or fields are missing', () => {
  assert.throws(() => parseExternalReference(''), (err) => err instanceof BillingRuleException);
  assert.throws(() => parseExternalReference(null), (err) => err instanceof BillingRuleException);
  assert.throws(() => parseExternalReference('id=intent-123'), (err) => err instanceof BillingRuleException);
  assert.throws(() => parseExternalReference('t=new'), (err) => err instanceof BillingRuleException);
});

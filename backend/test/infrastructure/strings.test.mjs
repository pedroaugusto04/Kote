import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateAttachmentSize } from '../../dist/domain/strings.js';

test('calculateAttachmentSize returns sizeBytes if it is positive and provided', () => {
  const size = calculateAttachmentSize(123, 'some base64');
  assert.equal(size, 123);
});

test('calculateAttachmentSize calculates size from base64 if sizeBytes is zero or missing', () => {
  const base64Str = Buffer.from('hello').toString('base64');
  assert.equal(calculateAttachmentSize(0, base64Str), 5);
  assert.equal(calculateAttachmentSize(undefined, base64Str), 5);
  assert.equal(calculateAttachmentSize(null, base64Str), 5);
});

test('calculateAttachmentSize returns 0 if neither size nor base64 is provided', () => {
  assert.equal(calculateAttachmentSize(undefined, undefined), 0);
  assert.equal(calculateAttachmentSize(0, ''), 0);
});

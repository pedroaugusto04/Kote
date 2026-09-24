import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateAttachmentSize, displayNameFromSlug, formatDisplayToken, extractAppNameFromEmail } from '../../dist/domain/strings.js';

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

test('displayNameFromSlug formats kebab-case slug into title case display name', () => {
  assert.equal(displayNameFromSlug('my-cool-project'), 'My Cool Project');
  assert.equal(displayNameFromSlug('inbox'), 'Inbox');
  assert.equal(displayNameFromSlug(''), '');
  assert.equal(displayNameFromSlug(null), '');
});

test('formatDisplayToken formats token and falls back to default or custom fallback', () => {
  assert.equal(formatDisplayToken('in_progress'), 'In Progress');
  assert.equal(formatDisplayToken('todo'), 'Todo');
  assert.equal(formatDisplayToken(''), 'Not Defined');
  assert.equal(formatDisplayToken(null), 'Not Defined');
  assert.equal(formatDisplayToken(undefined, 'None'), 'None');
});

test('extractAppNameFromEmail extracts display name or falls back to default', () => {
  assert.equal(extractAppNameFromEmail('Kote <no-reply@kote.local>'), 'Kote');
  assert.equal(extractAppNameFromEmail('Acme App <support@acme.com>'), 'Acme App');
  assert.equal(extractAppNameFromEmail('no-reply@kote.local'), 'Kote');
  assert.equal(extractAppNameFromEmail(''), 'Kote');
  assert.equal(extractAppNameFromEmail(null, 'CustomFallback'), 'CustomFallback');
});



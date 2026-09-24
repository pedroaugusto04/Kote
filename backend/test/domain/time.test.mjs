import test from 'node:test';
import assert from 'node:assert/strict';

import { shiftDateKey, normalizeDate, normalizeTime, formatDateInTimeZone } from '../../dist/domain/time.js';

test('shiftDateKey adds days to a dateKey string in UTC', () => {
  assert.equal(shiftDateKey('2026-01-01', 1), '2026-01-02');
  assert.equal(shiftDateKey('2026-01-31', 1), '2026-02-01');
  assert.equal(shiftDateKey('2026-02-28', 1), '2026-03-01');
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDateKey('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDateKey('2026-09-28', 7), '2026-10-05');
});

test('normalizeDate normalizes date formats and rejects invalid dates', () => {
  assert.equal(normalizeDate('2026-09-28'), '2026-09-28');
  assert.equal(normalizeDate('28/09/2026'), '2026-09-28');
  assert.equal(normalizeDate('invalid-date'), '');
});

test('normalizeTime normalizes time string and rejects invalid values', () => {
  assert.equal(normalizeTime('9:30'), '09:30');
  assert.equal(normalizeTime('14:05'), '14:05');
  assert.equal(normalizeTime('25:00'), '');
  assert.equal(normalizeTime('12:61'), '');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shiftDateKey,
  normalizeDate,
  normalizeTime,
  formatDateInTimeZone,
  getTimeZoneOffsetString,
  currentDateTimeInTimeZone,
  normalizeReminderAtToUtc,
} from '../../dist/domain/time.js';

test('getTimeZoneOffsetString returns correct offset formatted with sign and colon', () => {
  assert.equal(getTimeZoneOffsetString(new Date('2026-10-24T12:00:00Z'), 'America/Sao_Paulo'), '-03:00');
  assert.equal(getTimeZoneOffsetString(new Date('2026-10-24T12:00:00Z'), 'UTC'), '+00:00');
  assert.equal(getTimeZoneOffsetString(new Date('2026-10-24T12:00:00Z'), 'invalid-zone'), '+00:00');
});

test('currentDateTimeInTimeZone includes date, time, and offset', () => {
  const result = currentDateTimeInTimeZone('America/Sao_Paulo', new Date('2026-10-23T23:56:00Z'));
  assert.equal(result.date, '2026-10-23');
  assert.equal(result.time, '20:56');
  assert.equal(result.offset, '-03:00');
});

test('normalizeReminderAtToUtc correctly normalizes timestamps to UTC', () => {
  // ISO with explicit offset
  assert.equal(
    normalizeReminderAtToUtc('2026-10-24T14:00:00-03:00', 'America/Sao_Paulo'),
    '2026-10-24T17:00:00.000Z',
  );

  // ISO without offset is interpreted in user timezone (14:00 in America/Sao_Paulo = 17:00 UTC)
  assert.equal(
    normalizeReminderAtToUtc('2026-10-24T14:00:00', 'America/Sao_Paulo'),
    '2026-10-24T17:00:00.000Z',
  );

  // Space-separated date and time without offset
  assert.equal(
    normalizeReminderAtToUtc('2026-10-24 14:00', 'America/Sao_Paulo'),
    '2026-10-24T17:00:00.000Z',
  );

  // Brazilian format DD/MM/YYYY HH:mm
  assert.equal(
    normalizeReminderAtToUtc('24/10/2026 14:00', 'America/Sao_Paulo'),
    '2026-10-24T17:00:00.000Z',
  );

  // Date only defaults to 09:00 in specified timezone (09:00 in America/Sao_Paulo = 12:00 UTC)
  assert.equal(
    normalizeReminderAtToUtc('2026-10-24', 'America/Sao_Paulo'),
    '2026-10-24T12:00:00.000Z',
  );

  // Brazilian date only
  assert.equal(
    normalizeReminderAtToUtc('24/10/2026', 'America/Sao_Paulo'),
    '2026-10-24T12:00:00.000Z',
  );

  // Already UTC ISO string with Z
  assert.equal(
    normalizeReminderAtToUtc('2026-10-24T17:00:00.000Z', 'America/Sao_Paulo'),
    '2026-10-24T17:00:00.000Z',
  );

  // Invalid or empty
  assert.equal(normalizeReminderAtToUtc('', 'America/Sao_Paulo'), '');
  assert.equal(normalizeReminderAtToUtc('not-a-date', 'America/Sao_Paulo'), '');
});

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

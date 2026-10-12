import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeManualNoteStatus,
  isReminderOverdue,
  hasReminder,
  isReminderDispatchEligibleStatus,
} from '../../dist/domain/note-status.js';

test('normalizeManualNoteStatus returns pending when reminderAt is in the future even if currently sent', () => {
  const futureIso = new Date(Date.now() + 86_400_000).toISOString();
  const status = normalizeManualNoteStatus({
    currentStatus: 'sent',
    hadReminder: true,
    hasReminder: true,
    reminderAt: futureIso,
  });

  assert.equal(status, 'pending');
});

test('normalizeManualNoteStatus returns pending when reminderAt is in the future even if currently overdue', () => {
  const futureIso = new Date(Date.now() + 86_400_000).toISOString();
  const status = normalizeManualNoteStatus({
    currentStatus: 'overdue',
    hadReminder: true,
    hasReminder: true,
    reminderAt: futureIso,
  });

  assert.equal(status, 'pending');
});

test('normalizeManualNoteStatus retains terminal status if explicitly requested', () => {
  const futureIso = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(
    normalizeManualNoteStatus({
      requestedStatus: 'resolved',
      currentStatus: 'sent',
      hadReminder: true,
      hasReminder: true,
      reminderAt: futureIso,
    }),
    'resolved',
  );

  assert.equal(
    normalizeManualNoteStatus({
      requestedStatus: 'archived',
      currentStatus: 'pending',
      hadReminder: true,
      hasReminder: true,
      reminderAt: futureIso,
    }),
    'archived',
  );
});

test('normalizeManualNoteStatus retains sent when reminder is in the past and was already sent', () => {
  const pastIso = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(
    normalizeManualNoteStatus({
      currentStatus: 'sent',
      hadReminder: true,
      hasReminder: true,
      reminderAt: pastIso,
    }),
    'sent',
  );
});

test('hasReminder and isReminderDispatchEligibleStatus work correctly', () => {
  assert.equal(hasReminder({ reminderAt: '2026-10-30T10:00:00Z' }), true);
  assert.equal(hasReminder({ reminderDate: '2026-10-30' }), true);
  assert.equal(hasReminder({}), false);
  assert.equal(hasReminder(null), false);

  assert.equal(isReminderDispatchEligibleStatus('pending'), true);
  assert.equal(isReminderDispatchEligibleStatus('overdue'), true);
  assert.equal(isReminderDispatchEligibleStatus('sent'), false);
  assert.equal(isReminderDispatchEligibleStatus('resolved'), false);
  assert.equal(isReminderDispatchEligibleStatus('active'), false);
});

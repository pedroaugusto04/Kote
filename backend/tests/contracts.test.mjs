import test from 'node:test';
import assert from 'node:assert/strict';

import { ingestPayloadSchema, withDerivedReminderAt } from '../dist/contracts/ingest.js';

test('normalizes canonical ingest payload and derives reminderAt', () => {
  const parsed = withDerivedReminderAt(
    ingestPayloadSchema.parse({
      schemaVersion: 1,
      source: {
        channel: 'external',
        system: 'test',
        actor: 'tester',
        conversationId: 'conv-1',
        correlationId: 'corr-1',
      },
      event: {
        type: 'manual_note',
        occurredAt: '2026-04-27T10:00:00.000Z',
        projectSlug: 'N8N Automations',
      },
      content: {
        rawText: 'revisar deploy',
        title: '',
        attachments: [],
        sections: {
          summary: 'revisar deploy',
          impact: '',
          risks: [],
          nextSteps: [],
          reviewFindings: [],
        },
      },
      classification: {
        kind: 'note',
        canonicalType: 'event',
        importance: 'low',
        status: 'active',
        tags: ['Deploy', 'N8N'],
        decisionFlag: false,
      },
      actions: {
        reminderDate: '27/04/2026',
        reminderTime: '9:15',
        followUpBy: '',
      },
      metadata: {},
    }),
  );

  assert.equal(parsed.event.projectSlug, 'n8n-automations');
  assert.deepEqual(parsed.classification.tags, ['deploy', 'n8n']);
  assert.equal(parsed.actions.reminderDate, '2026-04-27');
  assert.equal(parsed.actions.reminderTime, '09:15');
  assert.equal(parsed.actions.reminderAt, '2026-04-27T09:15:00-03:00');
});

test('rejects reminder time without reminder date', () => {
  assert.throws(() => {
    ingestPayloadSchema.parse({
      schemaVersion: 1,
      source: {
        channel: 'external',
        system: 'test',
        actor: '',
        conversationId: '',
        correlationId: 'corr-2',
      },
      event: {
        type: 'generic_record',
        occurredAt: '2026-04-27T10:00:00.000Z',
        projectSlug: 'inbox',
      },
      content: {
        rawText: 'texto',
        title: '',
        attachments: [],
        sections: {},
      },
      classification: {
        kind: 'note',
        canonicalType: 'event',
        importance: 'low',
        tags: [],
        decisionFlag: false,
      },
      actions: {
        reminderDate: '',
        reminderTime: '09:00',
        followUpBy: '',
      },
      metadata: {},
    });
  });
});

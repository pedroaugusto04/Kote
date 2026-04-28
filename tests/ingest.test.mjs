import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryKnowledgeStore } from '../dist/application/knowledge-store.js';
import { IngestEntryUseCase } from '../dist/application/use-cases/index.js';

function payload() {
  return {
    schemaVersion: 1,
    source: {
      channel: 'n8n-workflow',
      system: 'test-suite',
      actor: 'tester',
      conversationId: 'conv',
      correlationId: 'corr-ingest',
    },
    event: {
      type: 'manual_note',
      occurredAt: '2026-04-27T10:00:00.000Z',
      projectSlug: 'n8n-automations',
    },
    content: {
      rawText: 'revisar rollout do deploy',
      title: 'Deploy rollout',
      attachments: [
        {
          fileName: 'sample.txt',
          mimeType: 'text/plain',
          sizeBytes: 11,
          dataBase64: Buffer.from('hello world').toString('base64'),
        },
      ],
      sections: {
        summary: 'Deploy needs coordinated rollout.',
        impact: 'Can affect webhook availability.',
        risks: ['Downtime'],
        nextSteps: ['Check production logs'],
        reviewFindings: [],
      },
    },
    classification: {
      kind: 'summary',
      canonicalType: 'knowledge',
      importance: 'medium',
      status: 'active',
      tags: ['deploy'],
      decisionFlag: false,
    },
    actions: {
      reminderDate: '2026-04-28',
      reminderTime: '09:30',
      followUpBy: '2026-04-29',
    },
    metadata: {},
  };
}

test('ingest persists event note, reminder note, attachment and workspace in repository', async () => {
  const store = new MemoryKnowledgeStore();
  const result = await new IngestEntryUseCase(store).execute(payload(), 'user-1', 'default');

  assert.equal(result.ok, true);
  assert.match(result.eventPath, /^20 Inbox\/n8n-automations\//);
  assert.match(result.reminderPath, /^60 Reminders\/n8n-automations\//);
  assert.equal(result.attachmentIds.length, 1);
  assert.ok(result.reminderNoteId);

  const notes = await store.listNotes('user-1');
  assert.equal(notes.filter((note) => note.type === 'event').length, 1);
  assert.equal(notes.filter((note) => note.type === 'reminder').length, 1);
  assert.equal((await store.listAttachments('user-1', result.noteId)).length, 1);
  assert.deepEqual((await store.listWorkspaces('user-1')).map((workspace) => workspace.workspaceSlug), ['default']);
});

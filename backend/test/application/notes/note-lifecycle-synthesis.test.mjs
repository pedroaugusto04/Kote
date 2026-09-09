import test from 'node:test';
import assert from 'node:assert/strict';

import { NoteLifecycleService } from '../../../dist/application/services/content/note-lifecycle.service.js';
import { AiSessionSynthesisScheduler } from '../../../dist/application/services/content/ai-session-synthesis-scheduler.service.js';

const userId = 'user-1';

function note(markdown) {
  return {
    id: 'note-1', path: 'session.md', categories: [], title: 'AI session', projectId: '', workspaceId: 'workspace-1', workspaceSlug: 'default', folderId: null,
    status: 'active', tags: [], occurredAt: '2026-09-09T12:00:00.000Z', sourceChannel: 'ai-chat', summary: 'Generated session overview', markdown,
    markdownStorageKey: '', metadata: {}, source: 'ai-chat', sessionId: 'session-1', reminderAt: '', sizeBytes: Buffer.byteLength(markdown),
  };
}

function createService({ storedNote, synthesis }) {
  const pendingCalls = [];
  const outboxCalls = [];
  const content = {
    getNoteById: async () => storedNote,
    updateNote: async (_userId, input) => ({ ...storedNote, ...input, sizeBytes: input.sizeBytes }),
    upsertNote: async (_userId, input) => ({ ...input, id: 'note-1' }),
    listAttachments: async () => [],
  };
  const syntheses = {
    getByNoteId: async () => synthesis,
    upsertPending: async (input) => { pendingCalls.push(input); },
  };
  const outbox = { enqueue: async (input) => { outboxCalls.push(input); } };
  const logger = { info() {}, error() {} };
  const scheduler = new AiSessionSynthesisScheduler(syntheses, outbox, logger);
  const service = new NoteLifecycleService(content, { checkQuota: async () => ({ allowed: true }) }, { publish: async () => {} }, { dispatch: async () => {} }, logger, scheduler);
  return { service, scheduler, pendingCalls, outboxCalls };
}

test('does not replace a completed synthesis when an AI session note is edited', async () => {
  const storedNote = note('User: initial request');
  const { service, pendingCalls, outboxCalls } = createService({
    storedNote,
    synthesis: { generatedAt: '2026-09-09T12:00:00.000Z', overview: 'Generated session overview' },
  });

  await service.saveNote(userId, { noteInput: { ...storedNote, markdown: 'User: updated request' } }, { existingNoteId: storedNote.id });

  assert.equal(pendingCalls.length, 0);
  assert.equal(outboxCalls.length, 0);
});

test('schedules an AI session without a synthesis after the inactivity window', async () => {
  const storedNote = note('User: initial request');
  const { service, pendingCalls, outboxCalls } = createService({ storedNote, synthesis: null });

  await service.saveNote(userId, { noteInput: { ...storedNote, markdown: 'User: updated request' } }, { existingNoteId: storedNote.id });

  assert.equal(pendingCalls.length, 1);
  assert.equal(outboxCalls.length, 1);
  assert.ok(outboxCalls[0].availableAt.getTime() - Date.now() > 23 * 60 * 60_000);
});

test('uses the same scheduler for an immediate regeneration request', async () => {
  const storedNote = note('User: current request');
  const { scheduler, pendingCalls, outboxCalls } = createService({ storedNote, synthesis: null });

  await scheduler.scheduleImmediately(userId, storedNote);

  assert.equal(pendingCalls.length, 1);
  assert.equal(pendingCalls[0].force, true);
  assert.equal(outboxCalls.length, 1);
  assert.equal(outboxCalls[0].force, true);
});

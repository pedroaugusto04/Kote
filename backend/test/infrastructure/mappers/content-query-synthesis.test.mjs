import test from 'node:test';
import assert from 'node:assert/strict';

import { noteDetail } from '../../../dist/infrastructure/mappers/content-query.mappers.js';
import { NoteSynthesisStatus } from '../../../dist/application/constants/ai-session-synthesis.constants.js';

test('noteDetail includes synthesis availableAt when present', () => {
  const noteRecord = {
    id: 'note-1',
    userId: 'user-1',
    path: 'session.md',
    categories: [],
    title: 'AI Session',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    projectSlug: 'kote',
    workspaceSlug: 'default',
    folderId: null,
    tags: [],
    occurredAt: '2026-09-10T12:00:00.000Z',
    createdAt: '2026-09-10T12:00:00.000Z',
    status: 'active',
    summary: 'Brief',
    source: 'ai-chat',
    sourceChannel: 'ai-chat',
    attachmentCount: 0,
    isPinned: false,
    markdown: 'User: hello',
    metadata: {},
  };

  const synthesisRecord = {
    id: 'syn-1',
    userId: 'user-1',
    noteId: 'note-1',
    status: NoteSynthesisStatus.Pending,
    mode: 'ai',
    overview: '',
    memory: [],
    sourceHash: 'some-hash',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    errorCode: null,
    availableAt: '2026-09-11T12:00:00.000Z',
    generatedAt: null,
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z',
  };

  const detail = noteDetail(noteRecord, [], undefined, synthesisRecord);

  assert.ok(detail.synthesis);
  assert.equal(detail.synthesis.status, NoteSynthesisStatus.Pending);
  assert.equal(detail.synthesis.availableAt, '2026-09-11T12:00:00.000Z');
});

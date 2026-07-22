import test from 'node:test';
import assert from 'node:assert/strict';

import { GenerateFileNotesSummaryUseCase } from '../../../dist/application/use-cases/notes/generate-file-notes-summary.use-case.js';

const request = {
  filePath: 'src/example.ts',
  notes: [{
    id: 'note-1',
    title: 'Deployment decision',
    date: '2026-06-01T12:00:00.000Z',
    content: 'Use the blue-green deployment strategy.',
    summary: 'Use the blue-green deployment strategy.',
    workspaceSlug: 'default',
  }],
};

function createUseCase({ credential, quota = { allowed: true } } = {}) {
  let quotaCalls = 0;
  const useCase = new GenerateFileNotesSummaryUseCase(
    { read: () => ({ fileNotesSummaryAiProvider: 'openai', fileNotesSummaryAiBaseUrl: 'https://ai.example.com', fileNotesSummaryAiModel: 'summary', fileNotesSummaryAiApiKey: 'secret' }) },
    { get: () => null, set: () => undefined },
    { info: () => undefined, warn: () => undefined },
    { checkAndConsume: async () => {
      if (!credential) return { enabled: false };
      quotaCalls += 1;
      return { enabled: true, quota };
    } },
  );
  return { useCase, getQuotaCalls: () => quotaCalls };
}

test('file summary returns a disabled fallback without consuming credits', async () => {
  const { useCase, getQuotaCalls } = createUseCase();

  const result = await useCase.execute('user-1', request);

  assert.equal(result.fallback, true);
  assert.equal(result.fallbackReason, 'feature_disabled');
  assert.match(result.summary, /not enabled/i);
  assert.equal(result.timeline[0].noteId, 'note-1');
  assert.equal(getQuotaCalls(), 0);
});

test('file summary returns a credit exhaustion fallback after the integration is enabled', async () => {
  const { useCase, getQuotaCalls } = createUseCase({
    credential: { status: 'connected', revokedAt: null },
    quota: { allowed: false, current: 100, limit: 100 },
  });

  const result = await useCase.execute('user-1', request);

  assert.equal(result.fallback, true);
  assert.equal(result.fallbackReason, 'quota_exceeded');
  assert.match(result.summary, /credits have been exhausted/i);
  assert.equal(result.timeline[0].noteId, 'note-1');
  assert.equal(getQuotaCalls(), 1);
});

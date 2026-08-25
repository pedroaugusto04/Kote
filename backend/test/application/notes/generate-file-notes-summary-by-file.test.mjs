import test from 'node:test';
import assert from 'node:assert/strict';

import { GenerateFileNotesSummaryByFileUseCase } from '../../../dist/application/use-cases/notes/generate-file-notes-summary-by-file.use-case.js';

test('file summary orchestration retrieves and maps note records inside the application layer', async () => {
  const repositoryCalls = [];
  const generationCalls = [];
  const useCase = new GenerateFileNotesSummaryByFileUseCase(
    {
      findNotesByFile: async (userId, filePath, options) => {
        repositoryCalls.push({ userId, filePath, options });
        return [{
          id: 'note-1',
          title: 'Retry decision',
          occurredAt: '2026-08-20T10:00:00.000Z',
          createdAt: '2026-08-19T10:00:00.000Z',
          updatedAt: '2026-08-21T10:00:00.000Z',
          markdown: 'Use idempotent retries.',
          summary: 'Retry policy',
          workspaceSlug: 'default',
        }];
      },
    },
    {
      execute: async (userId, request) => {
        generationCalls.push({ userId, request });
        return { summary: 'ok' };
      },
    },
  );

  const result = await useCase.execute('user-1', {
    filePath: 'src/billing/retry.ts',
    projectSlug: 'billing',
    workspaceSlug: 'default',
  });

  assert.deepEqual(repositoryCalls, [{
    userId: 'user-1',
    filePath: 'src/billing/retry.ts',
    options: { limit: 50, projectSlug: 'billing' },
  }]);
  assert.equal(generationCalls[0].request.notes[0].revision, '2026-08-21T10:00:00.000Z');
  assert.equal(generationCalls[0].request.notes[0].content, 'Use idempotent retries.');
  assert.deepEqual(result, { summary: 'ok' });
});

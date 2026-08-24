import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FindNotesBySnippetUseCase,
} from '../../../dist/application/use-cases/notes/find-notes-by-snippet.use-case.js';

test('FindNotesBySnippetUseCase returns empty when file has no notes', async () => {
  const logger = { info: () => {}, warn: () => {} };
  const mockNoteContextRepo = {
    findNotesByFile: async () => [],
  };

  const useCase = new FindNotesBySnippetUseCase(mockNoteContextRepo, logger);
  const result = await useCase.execute('user-1', {
    filePath: 'src/services/billing.ts',
    codeSnippet: 'function refundPayment() {}',
    gitContext: {
      commitHash: 'abc1234',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 0);
  assert.equal(result.total, 0);
  assert.equal(result.gitContext.commitHash, 'abc1234');
});

test('FindNotesBySnippetUseCase scores notes based on temporal commit proximity and snippet keywords, sorted chronologically', async () => {
  const logger = { info: () => {}, warn: () => {} };

  const commitDate = '2026-03-15T14:30:00.000Z';

  const mockNotes = [
    {
      id: 'note-old',
      title: 'Initial setup of project',
      summary: 'Configured boilerplate',
      path: 'src/services/billing.ts',
      markdown: 'Some old markdown',
      metadata: {},
      categories: [],
      tags: [],
      occurredAt: '2025-01-10T10:00:00.000Z',
      createdAt: '2025-01-10T10:00:00.000Z',
      projectSlug: 'kote-app',
      workspaceSlug: 'default',
      status: 'active',
      source: 'ide',
      sourceChannel: 'ide',
      projectId: 'p1',
      workspaceId: 'w1',
    },
    {
      id: 'note-commit-day',
      title: 'Fix: handle refundPayment timeouts',
      summary: 'Added retry for refundPayment in webhook handling',
      path: 'src/services/billing.ts',
      markdown: 'We had to implement refundPayment with idempotencyKey',
      metadata: {},
      categories: [],
      tags: ['billing', 'refund'],
      occurredAt: '2026-03-15T14:15:00.000Z', // 15 mins before commit!
      createdAt: '2026-03-15T14:15:00.000Z',
      projectSlug: 'kote-app',
      workspaceSlug: 'default',
      status: 'active',
      source: 'ai-chat',
      sourceChannel: 'claude-code',
      projectId: 'p1',
      workspaceId: 'w1',
    },
    {
      id: 'note-recent',
      title: 'Refactor billing to support PIX refunds',
      summary: 'Updated refundPayment for instant PIX gateway',
      path: 'src/services/billing.ts',
      markdown: 'Refactored refundPayment function',
      metadata: {},
      categories: [],
      tags: ['pix'],
      occurredAt: '2026-06-01T09:00:00.000Z', // More recent date
      createdAt: '2026-06-01T09:00:00.000Z',
      projectSlug: 'kote-app',
      workspaceSlug: 'default',
      status: 'active',
      source: 'ai-chat',
      sourceChannel: 'antigravity',
      projectId: 'p1',
      workspaceId: 'w1',
    },
  ];

  const mockNoteContextRepo = {
    findNotesByFile: async () => mockNotes,
  };

  const useCase = new FindNotesBySnippetUseCase(mockNoteContextRepo, logger);
  const result = await useCase.execute('user-1', {
    filePath: 'src/services/billing.ts',
    codeSnippet: 'async function refundPayment(idempotencyKey: string) {\n  return gateway.refund();\n}',
    gitContext: {
      commitHash: 'commit-999',
      commitDate,
      commitMessage: 'fix: handle refundPayment timeouts',
      author: 'Pedro',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 3);
  assert.equal(result.gitContext.commitHash, 'commit-999');

  // Verify chronological ordering: most recent (June 2026) -> March 2026 -> Jan 2025
  assert.equal(result.matches[0].note.id, 'note-recent');
  assert.equal(result.matches[1].note.id, 'note-commit-day');
  assert.equal(result.matches[2].note.id, 'note-old');

  // note-commit-day should have high score and isOriginMatch = true
  const commitMatch = result.matches.find((m) => m.note.id === 'note-commit-day');
  assert.equal(commitMatch.relevance.isOriginMatch, true);
  assert.ok(commitMatch.relevance.score >= 0.8);

  // note-recent should have high snippet score
  const recentNote = result.matches.find((m) => m.note.id === 'note-recent');
  assert.ok(recentNote.relevance.score > 0.1);
});

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

test('FindNotesBySnippetUseCase prioritizes selected-code overlap over commit timing', async () => {
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
      markdown: 'We had to implement refundPayment with idempotencyKey via gateway',
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
  assert.equal(result.matches.length, 2);
  assert.equal(result.gitContext.commitHash, 'commit-999');

  // Low-overlap file notes are removed by the backend before the response.
  assert.equal(result.matches[0].note.id, 'note-commit-day');
  assert.equal(result.matches[1].note.id, 'note-recent');

  // A same-day note without a linked commit is evaluated purely by content overlap (no temporal guessing).
  const commitMatch = result.matches.find((m) => m.note.id === 'note-commit-day');
  assert.equal(commitMatch.relevance.isOriginMatch, false);
  assert.equal(commitMatch.relevance.category, 'same-file');
  assert.ok(commitMatch.relevance.score >= 0.65);

  // note-recent should have high snippet score
  const recentNote = result.matches.find((m) => m.note.id === 'note-recent');
  assert.ok(recentNote.relevance.score > 0.1);
  assert.ok(commitMatch.relevance.contentScore > recentNote.relevance.contentScore);
  assert.equal(commitMatch.relevance.temporalScore, undefined);
});

test('FindNotesBySnippetUseCase matches deterministic linkedCommits on a note', async () => {
  const logger = { info: () => {}, warn: () => {} };

  const mockNotes = [
    {
      id: 'note-linked-commit',
      title: 'AI Session: refactor billing webhook',
      summary: 'Refactored billing webhook handler',
      path: 'src/services/billing.ts',
      markdown: 'Refactored billing webhook',
      metadata: {},
      linkedCommits: [
        {
          id: 'commit-1',
          commitSha: '9f8e7d6c5b4a32109f8e7d6c5b4a32109f8e7d6c',
          shortSha: '9f8e7d6',
          message: 'feat: refactor billing webhook',
          authorName: 'Pedro',
          committedAt: '2026-08-10T12:00:00.000Z',
          branch: 'main',
          htmlUrl: null,
          linkSource: 'session_files',
          confidence: 90,
          matchedFiles: ['src/services/billing.ts'],
        },
      ],
      categories: [],
      tags: [],
      occurredAt: '2026-08-10T11:45:00.000Z',
      createdAt: '2026-08-10T11:45:00.000Z',
      projectSlug: 'kote-app',
      workspaceSlug: 'default',
      status: 'active',
      source: 'claude-code',
      sourceChannel: 'ai-chat',
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
    codeSnippet: 'export function handleWebhook() {}',
    gitContext: {
      commitHash: '9f8e7d6',
      commitHashes: ['9f8e7d6'],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].note.id, 'note-linked-commit');
  assert.equal(result.matches[0].relevance.isOriginMatch, true);
  assert.equal(result.matches[0].relevance.category, 'origin');
  assert.equal(result.matches[0].relevance.score, 1.0);
});

test('FindNotesBySnippetUseCase matches direct GitHub headSha in note metadata', async () => {
  const logger = { info: () => {}, warn: () => {} };

  const mockNotes = [
    {
      id: 'note-hash-match',
      title: 'AI Session discussing database migration',
      summary: 'Generated migration script',
      path: 'src/db/migrate.ts',
      markdown: 'Generated migration',
      metadata: { headSha: 'abcdef1234567890' },
      categories: [],
      tags: [],
      occurredAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      projectSlug: 'kote-app',
      workspaceSlug: 'default',
      status: 'active',
      source: 'ai-chat',
      sourceChannel: 'claude-code',
      projectId: 'p1',
      workspaceId: 'w1',
    },
    {
      id: 'note-unrelated',
      title: 'Random note',
      summary: 'Unrelated note',
      path: 'src/db/migrate.ts',
      markdown: 'Random content',
      metadata: {},
      categories: [],
      tags: [],
      occurredAt: '2026-05-01T00:00:00.000Z',
      createdAt: '2026-05-01T00:00:00.000Z',
      projectSlug: 'kote-app',
      workspaceSlug: 'default',
      status: 'active',
      source: 'ide',
      sourceChannel: 'ide',
      projectId: 'p1',
      workspaceId: 'w1',
    },
  ];

  const mockNoteContextRepo = {
    findNotesByFile: async () => mockNotes,
  };

  const useCase = new FindNotesBySnippetUseCase(mockNoteContextRepo, logger);
  const result = await useCase.execute('user-1', {
    filePath: 'src/db/migrate.ts',
    codeSnippet: 'export async function migrate() {}',
    gitContext: {
      commitHash: 'different-primary-commit',
      commitHashes: ['different-primary-commit', 'abcdef1234567890'],
      commitDate: '2026-05-10T00:00:00.000Z', // Note date is months away, but commit hash matches!
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.matches[0].note.id, 'note-hash-match');
  assert.equal(result.matches[0].relevance.isOriginMatch, true);
  assert.equal(result.matches[0].relevance.category, 'origin');
  assert.equal(result.matches[0].relevance.score, 1.0);
  assert.equal(result.matches[0].relevance.contentScore, 1.0);
  assert.equal(result.matches[0].relevance.reason, 'Direct commit hash match');
});

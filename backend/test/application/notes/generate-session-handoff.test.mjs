import test from 'node:test';
import assert from 'node:assert/strict';

import { GenerateSessionHandoffUseCase } from '../../../dist/application/use-cases/notes/generate-session-handoff.use-case.js';

function createUseCase({
  notes = [],
  enabled = true,
  quotaAllowed = true,
  mockCompletion = 'Mocked handoff markdown',
} = {}) {
  let quotaCalls = 0;
  const mockContentRepo = {
    getNoteById: async (_userId, id) => notes.find((n) => n.id === id) || null,
    listNotes: async () => notes,
  };

  const mockAiEntitlement = {
    checkAndConsume: async () => {
      quotaCalls += 1;
      if (!enabled) return { enabled: false };
      return { enabled: true, quota: { allowed: quotaAllowed, limit: 100, current: 10 } };
    },
  };

  const mockLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };

  const mockEnv = {
    read: () => ({
      aiSessionSynthesisProvider: 'openai',
      aiSessionSynthesisBaseUrl: 'https://ai.example.com',
      aiSessionSynthesisModel: 'gpt-4o-mini',
      aiSessionSynthesisApiKey: 'test-key',
    }),
  };

  const useCase = new GenerateSessionHandoffUseCase(
    mockEnv,
    mockContentRepo,
    mockAiEntitlement,
    mockLogger,
  );

  return { useCase, getQuotaCalls: () => quotaCalls };
}

test('returns fallback when no transcript or previous note exists', async () => {
  const { useCase, getQuotaCalls } = createUseCase();

  const result = await useCase.execute('user-1', {
    provider: 'claude-code',
    autoDetectPrevious: true,
  });

  assert.equal(result.ok, true);
  assert.match(result.handoffMarkdown, /No previous session content found/i);
  assert.equal(getQuotaCalls(), 0);
});

test('returns fallback when entitlement is disabled', async () => {
  const { useCase, getQuotaCalls } = createUseCase({ enabled: false });

  const result = await useCase.execute('user-1', {
    rawText: 'User: Please refactor auth\nAssistant: Working on it.',
    provider: 'antigravity',
  });

  assert.equal(result.ok, true);
  assert.match(result.handoffMarkdown, /not enabled/i);
  assert.equal(getQuotaCalls(), 1);
});

test('returns fallback when quota is exceeded', async () => {
  const { useCase, getQuotaCalls } = createUseCase({ enabled: true, quotaAllowed: false });

  const result = await useCase.execute('user-1', {
    rawText: 'User: Please refactor auth\nAssistant: Working on it.',
    provider: 'antigravity',
  });

  assert.equal(result.ok, true);
  assert.match(result.handoffMarkdown, /quota exceeded/i);
  assert.equal(getQuotaCalls(), 1);
});

test('auto-detects previous session from a different provider', async () => {
  const notes = [
    {
      id: 'note-1',
      title: 'Antigravity session on auth',
      source: 'antigravity',
      sourceChannel: 'ai-chat',
      markdown: 'User: Refactor auth\nAssistant: Done.',
      createdAt: '2026-09-11T12:00:00.000Z',
    },
    {
      id: 'note-2',
      title: 'Claude Code earlier session',
      source: 'claude-code',
      sourceChannel: 'ai-chat',
      markdown: 'User: Check tests\nAssistant: Passed.',
      createdAt: '2026-09-11T10:00:00.000Z',
    },
  ];

  const { useCase } = createUseCase({ notes, enabled: false });

  const result = await useCase.execute('user-1', {
    provider: 'claude-code',
    autoDetectPrevious: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceProvider, 'antigravity');
  assert.equal(result.sourceNoteId, 'note-1');
  assert.equal(result.sourceTitle, 'Antigravity session on auth');
});

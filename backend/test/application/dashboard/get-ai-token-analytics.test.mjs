import test from 'node:test';
import assert from 'node:assert/strict';
import { GetAiTokenAnalyticsUseCase } from '../../../dist/application/use-cases/dashboard/get-ai-token-analytics.use-case.js';

const fakeLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

test('GetAiTokenAnalyticsUseCase', async (t) => {
  await t.test('aggregates token usage, models, and costs correctly', async () => {
    const mockNotes = [
      // Regular note without AI usage (should be ignored)
      {
        id: 'note-1',
        title: 'Meeting notes',
        metadata: {},
        occurredAt: '2026-03-10T10:00:00Z',
      },
      // AI note 1: Claude
      {
        id: 'note-2',
        title: 'Claude session',
        source: 'claude-code',
        occurredAt: '2026-03-11T12:00:00Z',
        metadata: {
          aiUsage: {
            provider: 'claude-code',
            model: 'claude-3-5-sonnet',
            inputTokens: 20_000,
            outputTokens: 4_000,
            totalTokens: 24_000,
            estimatedCostUsd: 0.12,
          },
        },
      },
      // AI note 2: OpenAI Codex
      {
        id: 'note-3',
        title: 'Codex session 1',
        source: 'codex-cli',
        occurredAt: '2026-03-11T15:00:00Z',
        metadata: {
          aiUsage: {
            provider: 'codex-cli',
            model: 'gpt-5.2',
            inputTokens: 10_000,
            outputTokens: 2_000,
            totalTokens: 12_000,
            estimatedCostUsd: 0.045,
          },
        },
      },
      // AI note 3: OpenAI Codex (next day)
      {
        id: 'note-4',
        title: 'Codex session 2',
        source: 'codex-cli',
        occurredAt: '2026-03-12T09:00:00Z',
        metadata: {
          aiUsage: {
            provider: 'codex-cli',
            model: 'gpt-5.2',
            inputTokens: 5_000,
            outputTokens: 1_000,
            totalTokens: 6_000,
            estimatedCostUsd: 0.0225,
          },
        },
      },
    ];

    const mockContentRepository = {
      listNotes: async () => mockNotes,
    };

    const useCase = new GetAiTokenAnalyticsUseCase(mockContentRepository, fakeLogger);
    const result = await useCase.execute('user-1');

    assert.equal(result.totalAiSessions, 3);
    assert.equal(result.totalTokens, 42_000);
    assert.equal(result.totalInputTokens, 35_000);
    assert.equal(result.totalOutputTokens, 7_000);
    assert.equal(result.totalEstimatedCostUsd, 0.1875);

    // Top model should be claude-3-5-sonnet (24k tokens > 18k tokens)
    assert.equal(result.topModel, 'claude-3-5-sonnet');

    // Models breakdown
    assert.equal(result.byModel.length, 2);
    const claudeModel = result.byModel.find((m) => m.model === 'claude-3-5-sonnet');
    assert.ok(claudeModel);
    assert.equal(claudeModel.totalTokens, 24_000);
    assert.equal(claudeModel.sessionCount, 1);
    assert.equal(claudeModel.percentage, 57.1);

    const gptModel = result.byModel.find((m) => m.model === 'gpt-5.2');
    assert.ok(gptModel);
    assert.equal(gptModel.totalTokens, 18_000);
    assert.equal(gptModel.sessionCount, 2);
    assert.equal(gptModel.percentage, 42.9);

    // Daily trend
    assert.equal(result.dailyTrend.length, 2);
    assert.equal(result.dailyTrend[0].date, '2026-03-11');
    assert.equal(result.dailyTrend[0].totalTokens, 36_000);
    assert.equal(result.dailyTrend[0].sessionCount, 2);

    // Available models and providers
    assert.deepEqual(result.availableModels, ['claude-3-5-sonnet', 'gpt-5.2']);
    assert.deepEqual(result.availableProviders, ['claude-code', 'codex-cli']);
  });

  await t.test('filters sessions by model while preserving availableModels list', async () => {
    const mockNotes = [
      {
        id: 'note-1',
        title: 'Claude session',
        source: 'claude-code',
        occurredAt: '2026-03-11T12:00:00Z',
        metadata: {
          aiUsage: {
            provider: 'claude-code',
            model: 'claude-3-5-sonnet',
            inputTokens: 20_000,
            outputTokens: 4_000,
            totalTokens: 24_000,
            estimatedCostUsd: 0.12,
          },
        },
      },
      {
        id: 'note-2',
        title: 'Codex session',
        source: 'codex-cli',
        occurredAt: '2026-03-11T15:00:00Z',
        metadata: {
          aiUsage: {
            provider: 'codex-cli',
            model: 'gpt-5.2',
            inputTokens: 10_000,
            outputTokens: 2_000,
            totalTokens: 12_000,
            estimatedCostUsd: 0.045,
          },
        },
      },
    ];

    const useCase = new GetAiTokenAnalyticsUseCase({ listNotes: async () => mockNotes }, fakeLogger);
    const result = await useCase.execute('user-1', { model: 'gpt-5.2' });

    assert.equal(result.totalAiSessions, 1);
    assert.equal(result.totalTokens, 12_000);
    assert.equal(result.topModel, 'gpt-5.2');
    assert.equal(result.byModel.length, 1);
    assert.equal(result.byModel[0].model, 'gpt-5.2');
    // availableModels still contains all models from the workspace
    assert.deepEqual(result.availableModels, ['claude-3-5-sonnet', 'gpt-5.2']);
  });

  await t.test('filters sessions by date range (inclusive YYYY-MM-DD)', async () => {
    const mockNotes = [
      {
        id: 'note-1',
        occurredAt: '2026-03-10T12:00:00Z',
        metadata: {
          aiUsage: {
            provider: 'claude-code',
            model: 'claude-3-5-sonnet',
            inputTokens: 5_000,
            outputTokens: 1_000,
            totalTokens: 6_000,
            estimatedCostUsd: 0.03,
          },
        },
      },
      {
        id: 'note-2',
        occurredAt: '2026-03-15T15:00:00Z',
        metadata: {
          aiUsage: {
            provider: 'codex-cli',
            model: 'gpt-5.2',
            inputTokens: 10_000,
            outputTokens: 2_000,
            totalTokens: 12_000,
            estimatedCostUsd: 0.045,
          },
        },
      },
      {
        id: 'note-3',
        occurredAt: '2026-03-20T10:00:00Z',
        metadata: {
          aiUsage: {
            provider: 'opencode',
            model: 'deepseek-v3',
            inputTokens: 8_000,
            outputTokens: 2_000,
            totalTokens: 10_000,
            estimatedCostUsd: 0.02,
          },
        },
      },
    ];

    const useCase = new GetAiTokenAnalyticsUseCase({ listNotes: async () => mockNotes });
    const result = await useCase.execute('user-1', {
      startDate: '2026-03-12',
      endDate: '2026-03-18',
    });

    assert.equal(result.totalAiSessions, 1);
    assert.equal(result.totalTokens, 12_000);
    assert.equal(result.topModel, 'gpt-5.2');
    assert.deepEqual(result.availableModels, ['claude-3-5-sonnet', 'deepseek-v3', 'gpt-5.2']);
  });

  await t.test('handles empty notes list gracefully', async () => {
    const mockContentRepository = {
      listNotes: async () => [],
    };

    const useCase = new GetAiTokenAnalyticsUseCase(mockContentRepository, fakeLogger);
    const result = await useCase.execute('user-1');

    assert.equal(result.totalAiSessions, 0);
    assert.equal(result.totalTokens, 0);
    assert.equal(result.totalEstimatedCostUsd, 0);
    assert.equal(result.topModel, 'None');
    assert.deepEqual(result.byModel, []);
    assert.deepEqual(result.byProvider, []);
    assert.deepEqual(result.dailyTrend, []);
    assert.deepEqual(result.availableModels, []);
    assert.deepEqual(result.availableProviders, []);
  });
});

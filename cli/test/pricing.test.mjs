import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSessionCostSync,
  calculateSessionCostWithRateSync,
  calculateSessionCost,
  getLiveOrCachedPricingTable,
} from '../dist/ai-history/pricing.js';

test('AI Pricing Engine', async (t) => {
  const samplePricingTable = {
    'openai:gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0, cachedInputPerMillion: 1.25 },
    'anthropic:claude-3-5-sonnet': {
      inputPerMillion: 3.0,
      outputPerMillion: 15.0,
      cachedInputPerMillion: 0.3,
      cacheWriteInputPerMillion: 3.75,
    },
  };

  await t.test('calculates correct cost when model is in dynamic/cached table', () => {
    // 10,000 input tokens ($2.50/M = $0.025) + 2,000 output tokens ($10.00/M = $0.02) = $0.045
    const cost = calculateSessionCostSync(
      {
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 10_000,
        outputTokens: 2_000,
      },
      samplePricingTable
    );
    assert.equal(cost, 0.045);
  });

  await t.test('calculates correct cost with cached tokens discount', () => {
    // 10,000 input (5,000 regular @ $2.50/M = $0.0125, 5,000 cached @ $1.25/M = $0.00625) + 1,000 output ($10/M = $0.01) = $0.02875
    const cost = calculateSessionCostSync(
      {
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 10_000,
        outputTokens: 1_000,
        cachedTokens: 5_000,
      },
      samplePricingTable
    );
    assert.equal(cost, 0.02875);
  });

  await t.test('calculates cache-write tokens with their dedicated rate', () => {
    const cost = calculateSessionCostSync(
      {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        inputTokens: 10_000,
        outputTokens: 1_000,
        cachedTokens: 2_000,
        cacheWriteTokens: 3_000,
      },
      samplePricingTable
    );
    // 5,000 regular + 2,000 cache-read + 3,000 cache-write + 1,000 output.
    assert.equal(cost, 0.04185);
  });

  await t.test('prefers native cost when provided by provider (e.g. OpenCode)', () => {
    const cost = calculateSessionCostSync({
      provider: 'opencode',
      model: 'custom-model',
      inputTokens: 100_000,
      outputTokens: 50_000,
      nativeCost: 0.123456,
    });
    assert.equal(cost, 0.123456);
  });

  await t.test('returns 0 cost for local or Ollama models', () => {
    const costOllama = calculateSessionCostSync({
      provider: 'ollama',
      model: 'qwen2.5-coder:32b',
      inputTokens: 50_000,
      outputTokens: 20_000,
    });
    assert.equal(costOllama, 0.0);

    const costLocal = calculateSessionCostSync({
      provider: 'local',
      model: 'deepseek-r1',
      inputTokens: 50_000,
      outputTokens: 20_000,
    });
    assert.equal(costLocal, 0.0);
  });

  await t.test('returns 0 cost when model is unknown and not in table (no outdated static fallback)', () => {
    const costUnknown = calculateSessionCostSync(
      {
        provider: 'unknown-provider',
        model: 'unknown-model-xyz',
        inputTokens: 100_000,
        outputTokens: 50_000,
      },
      samplePricingTable
    );
    assert.equal(costUnknown, 0.0);
  });

  await t.test('calculates cost for Antigravity Gemini model with human-readable label', () => {
    const tableWithGemini = {
      'google/gemini-3.8-flash': { inputPerMillion: 0.75, outputPerMillion: 3.75 },
      'gemini-3.8-flash': { inputPerMillion: 0.75, outputPerMillion: 3.75 },
    };
    const cost = calculateSessionCostSync(
      {
        provider: 'gemini',
        model: 'Gemini 3.8 Flash (High)',
        inputTokens: 132_101,
        outputTokens: 27_904,
      },
      tableWithGemini
    );
    assert.equal(cost, 0.203716);
  });

  await t.test('calculateSessionCostWithRateSync returns cost and model reference rates', () => {
    const res = calculateSessionCostWithRateSync(
      {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        inputTokens: 10_000,
        outputTokens: 2_000,
      },
      samplePricingTable
    );
    assert.equal(res.cost, 0.06);
    assert.deepEqual(res.rates, { inputPerMillion: 3.0, outputPerMillion: 15.0 });
  });

  await t.test('getLiveOrCachedPricingTable returns valid table from OpenRouter API or cache', async () => {
    const table = await getLiveOrCachedPricingTable();
    assert.ok(table);
    assert.equal(typeof table, 'object');
  });
});

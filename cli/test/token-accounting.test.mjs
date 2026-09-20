import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTokenUsageCost,
  getTokenUsageNormalizationStrategy,
} from '../dist/ai-history/token-accounting.js';

const rates = {
  'anthropic:claude-test': { inputPerMillion: 3, outputPerMillion: 15, cachedInputPerMillion: 0.3 },
  'openai:gpt-test': { inputPerMillion: 3, outputPerMillion: 15, cachedInputPerMillion: 0.3 },
  'opencode:custom-test': { inputPerMillion: 3, outputPerMillion: 15, cachedInputPerMillion: 0.3 },
};

test('provider token accounting strategies', async (t) => {
  await t.test('Anthropic keeps cache reads separate from input_tokens', () => {
    const normalized = getTokenUsageNormalizationStrategy('anthropic').normalize({
      inputTokens: 10_000,
      outputTokens: 1_000,
      cachedTokens: 5_000,
    });
    assert.equal(normalized.inputTokens, 10_000);
    assert.equal(normalized.cachedTokens, 5_000);

    const result = calculateTokenUsageCost({
      provider: 'anthropic',
      model: 'claude-test',
      usage: { inputTokens: 10_000, outputTokens: 1_000, cachedTokens: 5_000 },
    }, rates);
    assert.equal(result.cost, 0.0465);
  });

  await t.test('OpenAI subtracts cached input from the provider total', () => {
    const normalized = getTokenUsageNormalizationStrategy('openai').normalize({
      inputTokens: 15_000,
      outputTokens: 1_000,
      cachedTokens: 5_000,
    });
    assert.equal(normalized.inputTokens, 10_000);
    assert.equal(normalized.cachedTokens, 5_000);
  });

  await t.test('OpenCode does not subtract cache twice', () => {
    const result = calculateTokenUsageCost({
      provider: 'opencode',
      model: 'custom-test',
      usage: { inputTokens: 10_000, outputTokens: 1_000, cachedTokens: 5_000 },
    }, rates);
    assert.equal(result.cost, 0.0465);
  });
});

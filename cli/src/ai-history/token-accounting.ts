import {
  calculateSessionCostWithRateSync,
  type SessionCostResult,
  type TokenRate,
} from './pricing.js';

export interface RawTokenUsage {
  /** Provider-reported input tokens. Its meaning varies by provider. */
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  nativeCost?: number;
}

export interface NormalizedTokenUsage {
  /** Input tokens that are charged at the regular input rate. */
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  nativeCost?: number;
}

export interface TokenUsageNormalizationStrategy {
  readonly id: string;
  normalize(usage: RawTokenUsage): NormalizedTokenUsage;
}

function nonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function withSeparateCacheTokens(usage: RawTokenUsage): NormalizedTokenUsage {
  return {
    inputTokens: nonNegative(usage.inputTokens),
    cachedTokens: nonNegative(usage.cachedTokens),
    cacheWriteTokens: nonNegative(usage.cacheWriteTokens),
    outputTokens: nonNegative(usage.outputTokens),
    reasoningTokens: usage.reasoningTokens === undefined ? undefined : nonNegative(usage.reasoningTokens),
    nativeCost: usage.nativeCost,
  };
}

function withIncludedCacheTokens(usage: RawTokenUsage): NormalizedTokenUsage {
  const reportedInput = nonNegative(usage.inputTokens);
  const cachedTokens = Math.min(reportedInput, nonNegative(usage.cachedTokens));
  const remainingAfterCache = Math.max(0, reportedInput - cachedTokens);
  const cacheWriteTokens = Math.min(remainingAfterCache, nonNegative(usage.cacheWriteTokens));

  return {
    inputTokens: Math.max(0, reportedInput - cachedTokens - cacheWriteTokens),
    cachedTokens,
    cacheWriteTokens,
    outputTokens: nonNegative(usage.outputTokens),
    reasoningTokens: usage.reasoningTokens === undefined ? undefined : nonNegative(usage.reasoningTokens),
    nativeCost: usage.nativeCost,
  };
}

class AnthropicTokenUsageStrategy implements TokenUsageNormalizationStrategy {
  readonly id = 'anthropic';

  normalize(usage: RawTokenUsage): NormalizedTokenUsage {
    // Anthropic exposes input_tokens separately from cache_read_input_tokens.
    return withSeparateCacheTokens(usage);
  }
}

class OpenCodeTokenUsageStrategy implements TokenUsageNormalizationStrategy {
  readonly id = 'opencode';

  normalize(usage: RawTokenUsage): NormalizedTokenUsage {
    // OpenCode stores tokens.input after removing cache.read/cache.write.
    return withSeparateCacheTokens(usage);
  }
}

class IncludedCacheTokenUsageStrategy implements TokenUsageNormalizationStrategy {
  constructor(readonly id: string) {}

  normalize(usage: RawTokenUsage): NormalizedTokenUsage {
    // OpenAI and Gemini report cache tokens as part of their input total.
    return withIncludedCacheTokens(usage);
  }
}

const ANTHROPIC_STRATEGY = new AnthropicTokenUsageStrategy();
const OPENCODE_STRATEGY = new OpenCodeTokenUsageStrategy();
const OPENAI_STRATEGY = new IncludedCacheTokenUsageStrategy('openai');
const GOOGLE_STRATEGY = new IncludedCacheTokenUsageStrategy('google');
const DEFAULT_STRATEGY = new IncludedCacheTokenUsageStrategy('default');

function canonicalProvider(provider?: string): string {
  const normalized = (provider || '').trim().toLowerCase();
  if (normalized === 'claude' || normalized === 'claude-code' || normalized === 'anthropic') return 'anthropic';
  if (normalized === 'codex' || normalized === 'codex-cli' || normalized === 'openai') return 'openai';
  if (normalized === 'gemini' || normalized === 'antigravity' || normalized === 'google') return 'google';
  if (normalized === 'opencode' || normalized === 'open-code') return 'opencode';
  return normalized;
}

export function getTokenUsageNormalizationStrategy(provider?: string): TokenUsageNormalizationStrategy {
  switch (canonicalProvider(provider)) {
    case 'anthropic':
      return ANTHROPIC_STRATEGY;
    case 'opencode':
      return OPENCODE_STRATEGY;
    case 'openai':
      return OPENAI_STRATEGY;
    case 'google':
      return GOOGLE_STRATEGY;
    default:
      return DEFAULT_STRATEGY;
  }
}

export function normalizeTokenUsage(provider: string | undefined, usage: RawTokenUsage): NormalizedTokenUsage {
  return getTokenUsageNormalizationStrategy(provider).normalize(usage);
}

export function calculateTokenUsageCost(
  input: {
    provider?: string;
    model: string;
    usage: RawTokenUsage;
  },
  table?: Record<string, TokenRate>,
): SessionCostResult {
  const normalized = normalizeTokenUsage(input.provider, input.usage);
  const totalInputTokens = normalized.inputTokens + normalized.cachedTokens + normalized.cacheWriteTokens;

  const costInput = {
    provider: input.provider,
    model: input.model,
    inputTokens: totalInputTokens,
    outputTokens: normalized.outputTokens,
    cachedTokens: normalized.cachedTokens,
    cacheWriteTokens: normalized.cacheWriteTokens,
    nativeCost: normalized.nativeCost,
  };
  return table
    ? calculateSessionCostWithRateSync(costInput, table)
    : calculateSessionCostWithRateSync(costInput);
}

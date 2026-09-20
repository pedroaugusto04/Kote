import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  OPENROUTER_API_URL,
  PRICING_TIMEOUT_MS,
  PRICING_CACHE_TTL_MS,
  TOKENS_PER_MILLION,
  FREE_PROVIDER_KEYWORDS,
} from './constants';

export interface TokenRate {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
  cacheWriteInputPerMillion?: number;
}

interface OpenRouterModelPricing {
  prompt?: string;
  completion?: string;
  input_cache_read?: string;
  input_cache_write?: string;
}

interface OpenRouterModelItem {
  id: string;
  pricing?: OpenRouterModelPricing;
}

interface OpenRouterApiResponse {
  data?: OpenRouterModelItem[];
}

export interface CalculateCostInput {
  provider?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  nativeCost?: number;
}

function parsePricePerMillion(raw: string | undefined): number | undefined {
  const value = Number.parseFloat(raw || '');
  return Number.isFinite(value) && value >= 0 ? value * TOKENS_PER_MILLION : undefined;
}

let memoryPricingCache: Record<string, TokenRate> | null = null;
let lastCacheTime = 0;

function getPricingCacheFilePath(): string {
  const configDir = process.env.KB_CLI_CONFIG_DIR || path.join(os.homedir(), '.config', 'kote');
  return path.join(configDir, 'pricing-cache.json');
}

export function readDiskCache(): { table: Record<string, TokenRate>; timestamp: number } | null {
  try {
    const filePath = getPricingCacheFilePath();
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.table === 'object' && typeof parsed.timestamp === 'number') {
      return parsed;
    }
  } catch {
    // Ignore cache read errors
  }
  return null;
}

function writeDiskCache(table: Record<string, TokenRate>): void {
  try {
    const filePath = getPricingCacheFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(filePath, JSON.stringify({ timestamp: Date.now(), table }), { mode: 0o600 });
  } catch {
    // Ignore cache write errors
  }
}

export function normalizeModelName(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/-\d{8}$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/[_\s]+/g, '-')
    .replace(/^(google|anthropic|openai)\//, '')
    .trim();
}

export async function getLiveOrCachedPricingTable(): Promise<Record<string, TokenRate>> {
  // 1. Check memory cache
  if (memoryPricingCache && Date.now() - lastCacheTime < PRICING_CACHE_TTL_MS) {
    return memoryPricingCache;
  }

  // 2. Check disk cache if valid
  const disk = readDiskCache();
  if (disk && Date.now() - disk.timestamp < PRICING_CACHE_TTL_MS) {
    memoryPricingCache = disk.table;
    lastCacheTime = disk.timestamp;
    return memoryPricingCache;
  }

  // 3. Fetch dynamically from OpenRouter API
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PRICING_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_API_URL, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const json = (await res.json()) as OpenRouterApiResponse;
      const dynamic: Record<string, TokenRate> = {};

      for (const m of json.data || []) {
        const inputPerMillion = parsePricePerMillion(m.pricing?.prompt);
        const outputPerMillion = parsePricePerMillion(m.pricing?.completion);
        if (inputPerMillion !== undefined && outputPerMillion !== undefined) {
          const rate: TokenRate = {
            inputPerMillion,
            outputPerMillion,
            cachedInputPerMillion: parsePricePerMillion(m.pricing?.input_cache_read),
            cacheWriteInputPerMillion: parsePricePerMillion(m.pricing?.input_cache_write),
          };

          const idLower = m.id.toLowerCase();
          dynamic[idLower] = rate;
          dynamic[idLower.replace('/', ':')] = rate;

          const slug = idLower.split('/')[1];
          if (slug && (!dynamic[slug] || !idLower.includes(':batch'))) {
            dynamic[slug] = rate;
          }
        }
      }

      if (Object.keys(dynamic).length > 0) {
        memoryPricingCache = dynamic;
        lastCacheTime = Date.now();
        writeDiskCache(dynamic);
        return dynamic;
      }
    }
  } catch {
    clearTimeout(timeoutId);
  }

  // 4. Fallback to existing disk cache if API failed
  if (disk?.table) {
    memoryPricingCache = disk.table;
    lastCacheTime = disk.timestamp;
    return memoryPricingCache;
  }

  return memoryPricingCache || {};
}

export interface SessionCostResult {
  cost: number;
  rates?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
}

export function calculateSessionCostWithRateSync(
  input: CalculateCostInput,
  table: Record<string, TokenRate> = memoryPricingCache || readDiskCache()?.table || {}
): SessionCostResult {
  const hasNativeCost = typeof input.nativeCost === 'number' && input.nativeCost >= 0 && Number.isFinite(input.nativeCost);
  const nativeCostVal = hasNativeCost ? Number(input.nativeCost!.toFixed(6)) : undefined;

  const rawModel = (input.model || '').toLowerCase().trim();
  const cleanModel = normalizeModelName(input.model || '');
  const dashedModel = cleanModel.replace(/\./g, '-');
  let normProvider = (input.provider || '').toLowerCase().trim();
  if (normProvider === 'gemini' || normProvider === 'antigravity') {
    normProvider = 'google';
  } else if (normProvider === 'claude' || normProvider === 'claude-code') {
    normProvider = 'anthropic';
  } else if (normProvider === 'codex' || normProvider === 'codex-cli') {
    normProvider = 'openai';
  }

  const isFree = FREE_PROVIDER_KEYWORDS.some(
    (kw) => normProvider.includes(kw) || rawModel.includes(kw) || cleanModel.includes(kw)
  );
  if (isFree) {
    return { cost: nativeCostVal ?? 0.0, rates: { inputPerMillion: 0, outputPerMillion: 0 } };
  }

  // 1. Direct key match (by provider/model, slug or raw)
  let rate =
    table[`${normProvider}:${cleanModel}`] ||
    table[`${normProvider}/${cleanModel}`] ||
    table[cleanModel] ||
    table[`${normProvider}:${dashedModel}`] ||
    table[`${normProvider}/${dashedModel}`] ||
    table[dashedModel] ||
    table[`${normProvider}:${rawModel}`] ||
    table[`${normProvider}/${rawModel}`] ||
    table[rawModel];

  // 2. Fuzzy match against table keys
  if (!rate) {
    const matchedKey = Object.keys(table).find((k) => {
      const slug = k.split(/[/:]/)[1] || k;
      return (
        slug === cleanModel ||
        slug === dashedModel ||
        (cleanModel && slug.startsWith(cleanModel) && !k.includes(':batch')) ||
        (cleanModel && cleanModel.startsWith(slug) && !k.includes(':batch')) ||
        (dashedModel && slug.startsWith(dashedModel) && !k.includes(':batch')) ||
        (dashedModel && dashedModel.startsWith(slug) && !k.includes(':batch'))
      );
    });
    if (matchedKey) {
      rate = table[matchedKey];
    }
  }

  if (nativeCostVal !== undefined) {
    return {
      cost: nativeCostVal,
      rates: rate
        ? {
            inputPerMillion: rate.inputPerMillion,
            outputPerMillion: rate.outputPerMillion,
          }
        : undefined,
    };
  }

  if (!rate) {
    return { cost: 0.0 };
  }

  const reportedInput = Math.max(0, Number.isFinite(input.inputTokens) ? input.inputTokens : 0);
  const cached = Math.min(reportedInput, Math.max(0, input.cachedTokens || 0));
  const remainingAfterCache = Math.max(0, reportedInput - cached);
  const cacheWrite = Math.min(remainingAfterCache, Math.max(0, input.cacheWriteTokens || 0));
  const regularInput = Math.max(0, reportedInput - cached - cacheWrite);
  const output = Math.max(0, input.outputTokens);

  const inputRate = rate.inputPerMillion / TOKENS_PER_MILLION;
  const cachedRate = (rate.cachedInputPerMillion ?? rate.inputPerMillion * 0.5) / TOKENS_PER_MILLION;
  const cacheWriteRate = (rate.cacheWriteInputPerMillion ?? rate.inputPerMillion) / TOKENS_PER_MILLION;
  const outputRate = rate.outputPerMillion / TOKENS_PER_MILLION;

  const totalCost = regularInput * inputRate + cached * cachedRate + cacheWrite * cacheWriteRate + output * outputRate;
  const cost = Number.isFinite(totalCost) ? Number(totalCost.toFixed(6)) : 0.0;
  return {
    cost,
    rates: {
      inputPerMillion: rate.inputPerMillion,
      outputPerMillion: rate.outputPerMillion,
    },
  };
}

export function calculateSessionCostSync(
  input: CalculateCostInput,
  table: Record<string, TokenRate> = memoryPricingCache || readDiskCache()?.table || {}
): number {
  return calculateSessionCostWithRateSync(input, table).cost;
}

export async function calculateSessionCost(input: CalculateCostInput): Promise<number> {
  if (typeof input.nativeCost === 'number' && input.nativeCost >= 0 && Number.isFinite(input.nativeCost)) {
    return Number(input.nativeCost.toFixed(6));
  }
  const table = await getLiveOrCachedPricingTable();
  return calculateSessionCostWithRateSync(input, table).cost;
}

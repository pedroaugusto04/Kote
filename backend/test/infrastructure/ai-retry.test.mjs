import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isRetryableAiStatus,
  isRetryableNetworkError,
  parseRetryAfterMs,
  calculateAiRetryDelay,
  fetchWithAiRetry,
} from '../../dist/infrastructure/ai/ai-retry.js';

test('isRetryableAiStatus correctly identifies transient vs permanent HTTP status codes', () => {
  assert.equal(isRetryableAiStatus(503), true);
  assert.equal(isRetryableAiStatus(429), true);
  assert.equal(isRetryableAiStatus(500), true);
  assert.equal(isRetryableAiStatus(502), true);
  assert.equal(isRetryableAiStatus(504), true);

  assert.equal(isRetryableAiStatus(200), false);
  assert.equal(isRetryableAiStatus(400), false);
  assert.equal(isRetryableAiStatus(401), false);
  assert.equal(isRetryableAiStatus(403), false);
  assert.equal(isRetryableAiStatus(404), false);
  assert.equal(isRetryableAiStatus(422), false);
});

test('isRetryableNetworkError recognizes transient fetch and socket failures', () => {
  assert.equal(isRetryableNetworkError(new TypeError('fetch failed')), true);
  const timeoutErr = new Error('The operation was aborted due to timeout');
  timeoutErr.name = 'TimeoutError';
  assert.equal(isRetryableNetworkError(timeoutErr), true);

  const connReset = new Error('connection reset');
  connReset.code = 'ECONNRESET';
  assert.equal(isRetryableNetworkError(connReset), true);

  assert.equal(isRetryableNetworkError(new Error('SyntaxError: invalid json')), false);
  assert.equal(isRetryableNetworkError(null), false);
});

test('parseRetryAfterMs correctly parses seconds and dates from headers', () => {
  const headersWithSeconds = new Headers({ 'retry-after': '3' });
  const responseWithSeconds = new Response(null, { headers: headersWithSeconds });
  assert.equal(parseRetryAfterMs(responseWithSeconds), 3000);

  const futureDate = new Date(Date.now() + 5000).toUTCString();
  const headersWithDate = new Headers({ 'retry-after': futureDate });
  const responseWithDate = new Response(null, { headers: headersWithDate });
  const diff = parseRetryAfterMs(responseWithDate);
  assert.ok(diff !== null && diff >= 3000 && diff <= 6000);

  const responseNoHeader = new Response(null);
  assert.equal(parseRetryAfterMs(responseNoHeader), null);
});

test('calculateAiRetryDelay applies backoff, jitter, and respects maxDelay', () => {
  const delay0 = calculateAiRetryDelay(0, { baseDelayMs: 1000, maxDelayMs: 4000, jitterPercent: 0 });
  assert.equal(delay0, 1000);

  const delay1 = calculateAiRetryDelay(1, { baseDelayMs: 1000, maxDelayMs: 4000, jitterPercent: 0 });
  assert.equal(delay1, 2000);

  const delay2 = calculateAiRetryDelay(2, { baseDelayMs: 1000, maxDelayMs: 3000, jitterPercent: 0 });
  assert.equal(delay2, 3000); // capped at maxDelayMs

  // With jitter, should stay within jitter boundaries
  const jitteredDelay = calculateAiRetryDelay(0, { baseDelayMs: 1000, maxDelayMs: 4000, jitterPercent: 20 });
  assert.ok(jitteredDelay >= 800 && jitteredDelay <= 1200);
});

test('fetchWithAiRetry returns successful response immediately on first attempt without retrying', async () => {
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const response = await fetchWithAiRetry(mockFetch, {
    maxRetries: 2,
    baseDelayMs: 10,
    sleepFn: async () => {},
  });

  assert.equal(calls, 1);
  assert.equal(response.status, 200);
});

test('fetchWithAiRetry retries on 503 Service Unavailable and succeeds on subsequent attempt', async () => {
  let calls = 0;
  const retryEvents = [];

  const mockFetch = async () => {
    calls++;
    if (calls === 1) {
      return new Response(
        JSON.stringify({
          error: {
            code: 503,
            message: 'This model is currently experiencing high demand.',
            status: 'UNAVAILABLE',
          },
        }),
        { status: 503 },
      );
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }), { status: 200 });
  };

  const response = await fetchWithAiRetry(mockFetch, {
    maxRetries: 2,
    baseDelayMs: 10,
    sleepFn: async () => {},
    onRetry: (info) => retryEvents.push(info),
  });

  assert.equal(calls, 2);
  assert.equal(response.status, 200);
  assert.equal(retryEvents.length, 1);
  assert.equal(retryEvents[0].attempt, 1);
  assert.equal(retryEvents[0].status, 503);
});

test('fetchWithAiRetry retries on 429 and respects Retry-After header', async () => {
  let calls = 0;
  const retryEvents = [];

  const mockFetch = async () => {
    calls++;
    if (calls === 1) {
      return new Response('Rate limit reached', {
        status: 429,
        headers: { 'retry-after': '2' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const response = await fetchWithAiRetry(mockFetch, {
    maxRetries: 2,
    baseDelayMs: 10,
    maxDelayMs: 5000,
    sleepFn: async () => {},
    onRetry: (info) => retryEvents.push(info),
  });

  assert.equal(calls, 2);
  assert.equal(response.status, 200);
  assert.equal(retryEvents.length, 1);
  assert.equal(retryEvents[0].status, 429);
  // Delay should be ~2000ms from the header (with default jitter)
  assert.ok(retryEvents[0].delayMs >= 1500 && retryEvents[0].delayMs <= 2500);
});

test('fetchWithAiRetry does NOT retry on non-retryable 4xx errors like 400 or 401', async () => {
  let calls = 0;
  const retryEvents = [];

  const mockFetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: 'invalid_api_key' }), { status: 401 });
  };

  const response = await fetchWithAiRetry(mockFetch, {
    maxRetries: 2,
    baseDelayMs: 10,
    sleepFn: async () => {},
    onRetry: (info) => retryEvents.push(info),
  });

  assert.equal(calls, 1);
  assert.equal(response.status, 401);
  assert.equal(retryEvents.length, 0);
});

test('fetchWithAiRetry returns final 503 response after maxRetries are exhausted', async () => {
  let calls = 0;
  const retryEvents = [];

  const mockFetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        error: {
          code: 503,
          message: 'This model is currently experiencing high demand.',
          status: 'UNAVAILABLE',
        },
      }),
      { status: 503 },
    );
  };

  const response = await fetchWithAiRetry(mockFetch, {
    maxRetries: 2,
    baseDelayMs: 10,
    sleepFn: async () => {},
    onRetry: (info) => retryEvents.push(info),
  });

  // initial call + 2 retries = 3 total calls
  assert.equal(calls, 3);
  assert.equal(response.status, 503);
  assert.equal(retryEvents.length, 2);
  assert.equal(retryEvents[0].attempt, 1);
  assert.equal(retryEvents[1].attempt, 2);
});

test('fetchWithAiRetry retries on transient network errors and recovers', async () => {
  let calls = 0;
  const retryEvents = [];

  const mockFetch = async () => {
    calls++;
    if (calls === 1) {
      throw new TypeError('fetch failed');
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const response = await fetchWithAiRetry(mockFetch, {
    maxRetries: 2,
    baseDelayMs: 10,
    sleepFn: async () => {},
    onRetry: (info) => retryEvents.push(info),
  });

  assert.equal(calls, 2);
  assert.equal(response.status, 200);
  assert.equal(retryEvents.length, 1);
  assert.equal(retryEvents[0].error instanceof TypeError, true);
});

test('fetchWithAiRetry rethrows error when network error persists beyond maxRetries', async () => {
  let calls = 0;

  const mockFetch = async () => {
    calls++;
    throw new TypeError('fetch failed');
  };

  await assert.rejects(
    async () => {
      await fetchWithAiRetry(mockFetch, {
        maxRetries: 2,
        baseDelayMs: 10,
        sleepFn: async () => {},
      });
    },
    (err) => err instanceof TypeError && err.message === 'fetch failed',
  );

  assert.equal(calls, 3);
});

test('runOpenAiLoop recovers from transient 503 error using retry options', async () => {
  const { runOpenAiLoop } = await import('../../dist/infrastructure/ai/openai-tool-calling.js');

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = async () => {
    fetchCount++;
    if (fetchCount === 1) {
      return new Response(
        JSON.stringify({
          error: {
            code: 503,
            message: 'This model is currently experiencing high demand.',
            status: 'UNAVAILABLE',
          },
        }),
        { status: 503 },
      );
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Successfully answered after recovery',
            },
          },
        ],
      }),
      { status: 200 },
    );
  };

  try {
    const result = await runOpenAiLoop(
      {
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        apiKey: 'test-key',
        maxTurns: 2,
        retryOptions: {
          maxRetries: 2,
          baseDelayMs: 1,
          sleepFn: async () => {},
        },
      },
      'system prompt',
      'user question',
      [],
      (text) => text,
      () => 'fallback',
    );

    assert.equal(result, 'Successfully answered after recovery');
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


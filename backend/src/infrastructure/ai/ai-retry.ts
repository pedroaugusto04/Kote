export type AiRetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterPercent?: number;
  sleepFn?: (ms: number) => Promise<void>;
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    status?: number;
    error?: unknown;
  }) => void;
};

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 4000;
const DEFAULT_JITTER_PERCENT = 20;

export function isRetryableAiStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export function isRetryableNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof TypeError) return true;
  const err = error as Record<string, unknown>;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  const code = String(err.code || '');
  if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(code)) {
    return true;
  }
  const message = String(err.message || '').toLowerCase();
  return message.includes('fetch failed') || message.includes('network') || message.includes('timeout');
}

export function parseRetryAfterMs(response?: Response): number | null {
  if (!response?.headers) return null;
  const header = response.headers.get('retry-after');
  if (!header) return null;

  const seconds = parseInt(header, 10);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    const diff = date.getTime() - Date.now();
    return Math.max(0, diff);
  }

  return null;
}

export function calculateAiRetryDelay(
  attempt: number,
  options: AiRetryOptions = {},
  response?: Response,
): number {
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitterPercent = options.jitterPercent ?? DEFAULT_JITTER_PERCENT;

  let delayMs: number;
  const retryAfterMs = parseRetryAfterMs(response);
  if (retryAfterMs !== null && retryAfterMs > 0) {
    delayMs = Math.min(retryAfterMs, maxDelayMs);
  } else {
    delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  }

  if (jitterPercent > 0) {
    const jitter = delayMs * (jitterPercent / 100);
    delayMs = delayMs + (Math.random() * jitter * 2 - jitter);
  }

  return Math.max(50, Math.floor(delayMs));
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithAiRetry(
  requestFn: () => Promise<Response>,
  options: AiRetryOptions = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const sleepFn = options.sleepFn ?? defaultSleep;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await requestFn();
      if (attempt < maxRetries && isRetryableAiStatus(response.status)) {
        const delayMs = calculateAiRetryDelay(attempt, options, response);
        await response.text().catch(() => {});
        options.onRetry?.({
          attempt: attempt + 1,
          delayMs,
          status: response.status,
        });
        await sleepFn(delayMs);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt < maxRetries && isRetryableNetworkError(error)) {
        const delayMs = calculateAiRetryDelay(attempt, options);
        options.onRetry?.({
          attempt: attempt + 1,
          delayMs,
          error,
        });
        await sleepFn(delayMs);
        continue;
      }
      throw error;
    }
  }

  return requestFn();
}

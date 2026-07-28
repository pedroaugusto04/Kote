/**
 * Exponential backoff with jitter and rate limit detection
 */

export type BackoffOptions = {
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetries: number;
  multiplier?: number;
  jitterPercent?: number;
};

export type BackoffResult = {
  shouldRetry: boolean;
  delayMs: number;
  retryCount: number;
};

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function calculateBackoff(
  retryCount: number,
  options: BackoffOptions,
  isRateLimit: boolean = false,
  rateLimitRetryAfterMs?: number,
): BackoffResult {
  const {
    baseDelayMs,
    maxDelayMs,
    maxRetries,
    multiplier = 2,
    jitterPercent = 20,
  } = options;

  // Check if max retries exceeded
  if (retryCount >= maxRetries) {
    return { shouldRetry: false, delayMs: 0, retryCount };
  }

  let delayMs: number;

  // If rate limit with specific retry-after, use that
  if (isRateLimit && rateLimitRetryAfterMs) {
    delayMs = Math.min(rateLimitRetryAfterMs, maxDelayMs);
  }
  // If rate limit without retry-after, use aggressive backoff
  else if (isRateLimit) {
    delayMs = Math.min(baseDelayMs * Math.pow(3, retryCount), maxDelayMs);
  }
  // Standard exponential backoff
  else {
    delayMs = Math.min(baseDelayMs * Math.pow(multiplier, retryCount), maxDelayMs);
  }

  // Add jitter to avoid thundering herd
  const jitter = delayMs * (jitterPercent / 100);
  const jitteredDelay = delayMs + (Math.random() * jitter * 2 - jitter);

  return {
    shouldRetry: true,
    delayMs: Math.max(0, Math.floor(jitteredDelay)),
    retryCount,
  };
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function parseRateLimitFromHeaders(headers: Record<string, string | string[] | undefined>): number | null {
  const retryAfter = headers['retry-after'] || headers['Retry-After'];
  if (!retryAfter) return null;

  const value = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
  
  // Retry-After can be seconds (number) or HTTP date
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // If it's a date, calculate difference from now
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    return Math.max(0, diffMs);
  }

  return null;
}

export const MAX_REMINDER_DELIVERY_ATTEMPTS = 5;

const BASE_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;
const JITTER_RATIO = 0.3;

export function reminderRetryDelayMs(failedAttemptCount: number, randomValue = Math.random()): number {
  const attempt = Math.max(1, Math.min(Math.trunc(failedAttemptCount), MAX_REMINDER_DELIVERY_ATTEMPTS));
  const exponentialDelay = Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
  const jitter = Math.floor(exponentialDelay * JITTER_RATIO * clampRandom(randomValue));
  return exponentialDelay + jitter;
}

export function nextReminderRetryAt(referenceNowIso: string, failedAttemptCount: number, randomValue = Math.random()): string {
  const referenceMs = Date.parse(referenceNowIso);
  const baseMs = Number.isNaN(referenceMs) ? Date.now() : referenceMs;
  return new Date(baseMs + reminderRetryDelayMs(failedAttemptCount, randomValue)).toISOString();
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

const exactSensitiveKeys = new Set([
  'authorization',
  'cookie',
  'xhubsignature256',
  'xkbwebhooktoken',
  'xtelegrambotapisecrettoken',
]);

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveLogKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return exactSensitiveKeys.has(normalized)
    || normalized.includes('authorization')
    || normalized.includes('cookie')
    || normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('apikey');
}

function redactInternal(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactInternal(entry, seen));
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, isSensitiveLogKey(key) ? '[redacted]' : redactInternal(entry, seen)]),
  );
}

export function redactSensitiveValue<T>(value: T): T {
  return redactInternal(value, new WeakSet<object>()) as T;
}

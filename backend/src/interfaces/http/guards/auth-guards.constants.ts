export const RATE_LIMIT_NAMESPACES = {
  AUTH: 'auth',
  GLOBAL: 'global',
  WEBHOOK: 'webhook',
} as const;

export const RATE_LIMIT_CONFIG = {
  AUTH: { limit: 10, windowMs: 60_000 },
  GLOBAL: { limit: 300, windowMs: 60_000 },
  WEBHOOK: { limit: 60, windowMs: 60_000 },
} as const;

export const AUTH_ERROR_MESSAGES = {
  RATE_LIMITED: 'rate_limited',
  INVALID_ORIGIN: 'invalid_origin',
  INVALID_INTERNAL_TOKEN: 'invalid_internal_token',
} as const;

export const AUTH_HEADERS = {
  BEARER_PREFIX: 'Bearer ',
  CHROME_EXTENSION_PREFIX: 'chrome-extension://',
} as const;

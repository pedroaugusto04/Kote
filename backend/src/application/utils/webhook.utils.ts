import { isSensitiveLogKey, redactSensitiveValue } from '../../observability/redact.js';

export function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(',') : String(value || '')]));
}

function isSensitiveKey(key: string): boolean {
  return isSensitiveLogKey(key);
}

export function sanitizeWebhookValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  return redactSensitiveValue(value);
}

export function sanitizeWebhookHeaders(headers: Record<string, unknown> = {}): Record<string, unknown> {
  return sanitizeWebhookValue(headers) as Record<string, unknown>;
}

export function extractWhatsappExternalId(body: Record<string, unknown>): string {
  const data = body.data as Record<string, unknown> | undefined;
  const key = data?.key as Record<string, unknown> | undefined;
  return String(
    body.jid ||
      body.remoteJid ||
      body.chatId ||
      body.from ||
      key?.remoteJid ||
      data?.remoteJid ||
      data?.chatId ||
      '',
  ).trim();
}

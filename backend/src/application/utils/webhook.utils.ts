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
  const payload = whatsappPayload(body);
  const data = body.data as Record<string, unknown> | undefined;
  const key = payload.key as Record<string, unknown> | undefined;
  const source = body.source as Record<string, unknown> | undefined;
  return String(
    body.jid ||
      body.remoteJid ||
      body.chatId ||
      body.from ||
      source?.conversationId ||
      key?.remoteJid ||
      data?.remoteJid ||
      data?.chatId ||
      '',
  ).trim();
}

export type ParsedWhatsappEvolutionMessage =
  | {
      kind: 'message';
      groupId: string;
      senderId: string;
      messageId: string;
      messageText: string;
      hasMedia: boolean;
      fromMe: boolean;
      isGroup: boolean;
    }
  | {
      kind: 'ignored';
      reason: 'unsupported_event' | 'missing_payload';
    };

function whatsappPayload(body: Record<string, unknown>): Record<string, unknown> {
  const data = body.data;
  return data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : body;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function evolutionEvent(body: Record<string, unknown>, payload: Record<string, unknown>): string {
  return stringValue(body.event || body.eventType || body.type || payload.event || payload.eventType || payload.type).toUpperCase().replace(/[.-]/g, '_');
}

function mediaCaption(message: Record<string, unknown>): string {
  const mediaKeys = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage'];
  for (const key of mediaKeys) {
    const media = objectValue(message[key]);
    const caption = stringValue(media?.caption);
    if (caption) return caption;
  }
  return '';
}

function hasWhatsappMedia(message: Record<string, unknown>): boolean {
  return ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage'].some((key) => Boolean(objectValue(message[key])));
}

export function parseWhatsappEvolutionMessage(body: Record<string, unknown>): ParsedWhatsappEvolutionMessage {
  const payload = whatsappPayload(body);
  const event = evolutionEvent(body, payload);
  if (event && event !== 'MESSAGES_UPSERT') return { kind: 'ignored', reason: 'unsupported_event' };

  const key = objectValue(payload.key);
  const message = objectValue(payload.message) || objectValue(body.message);
  if (!key || !message) return { kind: 'ignored', reason: 'missing_payload' };

  const groupId = stringValue(key.remoteJid || payload.remoteJid || payload.chatId || body.remoteJid || body.chatId);
  const senderId = stringValue(key.participant || payload.participant || body.participant || groupId);
  const messageId = stringValue(key.id || payload.messageId || body.messageId);
  const text = stringValue(
    message.conversation ||
      objectValue(message.extendedTextMessage)?.text ||
      mediaCaption(message) ||
      payload.text ||
      payload.body ||
      body.text ||
      body.body,
  );

  return {
    kind: 'message',
    groupId,
    senderId,
    messageId,
    messageText: text,
    hasMedia: hasWhatsappMedia(message),
    fromMe: key.fromMe === true || stringValue(key.fromMe).toLowerCase() === 'true',
    isGroup: groupId.endsWith('@g.us'),
  };
}

import { redactSensitiveValue } from '../../observability/redact.js';

export function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(',') : String(value || '')]));
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
  const data = firstObjectValue(body.data);
  const key = payload.key as Record<string, unknown> | undefined;
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

export type ParsedWhatsappEvolutionMessage =
  | {
      kind: 'message';
      chatId: string;
      senderId: string;
      messageId: string;
      messageText: string;
      hasMedia: boolean;
      media: {
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        dataBase64: string;
      };
      fromMe: boolean;
      isGroup: boolean;
    }
  | {
      kind: 'ignored';
      reason: 'unsupported_event' | 'missing_payload';
    };

function whatsappPayload(body: Record<string, unknown>): Record<string, unknown> {
  return firstObjectValue(body.data) || body;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function firstObjectValue(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    return value.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) as Record<string, unknown> | undefined;
  }
  return objectValue(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function base64Value(value: unknown): string {
  const raw = stringValue(value);
  const marker = ';base64,';
  const markerIndex = raw.indexOf(marker);
  return markerIndex >= 0 ? raw.slice(markerIndex + marker.length).trim() : raw;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(stringValue(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function evolutionEvent(body: Record<string, unknown>, payload: Record<string, unknown>): string {
  return stringValue(body.event || body.eventType || body.type || payload.event || payload.eventType || payload.type).toUpperCase().replace(/[.-]/g, '_');
}

const whatsappMediaTypes = [
  { key: 'imageMessage', type: 'image', fallbackMimeType: 'image/jpeg' },
  { key: 'videoMessage', type: 'video', fallbackMimeType: 'video/mp4' },
  { key: 'documentMessage', type: 'document', fallbackMimeType: 'application/octet-stream' },
  { key: 'audioMessage', type: 'audio', fallbackMimeType: 'audio/ogg' },
  { key: 'stickerMessage', type: 'sticker', fallbackMimeType: 'image/webp' },
] as const;

function mediaCaption(message: Record<string, unknown>): string {
  for (const { key } of whatsappMediaTypes) {
    const media = objectValue(message[key]);
    const caption = stringValue(media?.caption);
    if (caption) return caption;
  }
  return '';
}

function hasWhatsappMedia(message: Record<string, unknown>): boolean {
  return whatsappMediaTypes.some(({ key }) => Boolean(objectValue(message[key])));
}

function mediaBase64(payload: Record<string, unknown>): string {
  const payloadData = objectValue(payload.data);
  return base64Value(
    payload.dataBase64 ||
      payloadData?.base64,
  );
}

function parseWhatsappMedia(payload: Record<string, unknown>, message: Record<string, unknown>) {
  for (const { key, type, fallbackMimeType } of whatsappMediaTypes) {
    const media = objectValue(message[key]);
    if (!media) continue;
    const mimeType = stringValue(media.mimetype || media.mimeType) || fallbackMimeType;
    return {
      fileName: stringValue(media.fileName || media.title || `attachment.${type}`),
      mimeType,
      sizeBytes: numberValue(media.fileLength || media.fileSize || media.sizeBytes),
      dataBase64: mediaBase64(payload),
    };
  }
  return {
    fileName: '',
    mimeType: 'application/octet-stream',
    sizeBytes: 0,
    dataBase64: '',
  };
}

export function parseWhatsappEvolutionMessage(body: Record<string, unknown>): ParsedWhatsappEvolutionMessage {
  const payload = whatsappPayload(body);
  const event = evolutionEvent(body, payload);
  if (event && event !== 'MESSAGES_UPSERT') return { kind: 'ignored', reason: 'unsupported_event' };

  const key = objectValue(payload.key);
  const rawMessage = objectValue(payload.message) || objectValue(body.message);
  const message = objectValue(objectValue(rawMessage?.ephemeralMessage)?.message)
    || objectValue(objectValue(rawMessage?.viewOnceMessage)?.message)
    || objectValue(objectValue(rawMessage?.viewOnceMessageV2)?.message)
    || objectValue(objectValue(rawMessage?.documentWithCaptionMessage)?.message)
    || rawMessage;
  if (!key || !message) return { kind: 'ignored', reason: 'missing_payload' };

  const chatId = stringValue(key.remoteJid || payload.remoteJid || payload.chatId || body.remoteJid || body.chatId);
  const senderId = stringValue(key.participant || payload.participant || body.participant || chatId);
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

  const media = parseWhatsappMedia(payload, message);

  return {
    kind: 'message',
    chatId,
    senderId,
    messageId,
    messageText: text,
    hasMedia: Boolean(media.fileName) || hasWhatsappMedia(message),
    media,
    fromMe: key.fromMe === true || stringValue(key.fromMe).toLowerCase() === 'true',
    isGroup: chatId.endsWith('@g.us'),
  };
}

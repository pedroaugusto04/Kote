import { Injectable } from '@nestjs/common';

import { ReminderDeliveryChannel } from '../contracts/enums.js';
import { readEnvironment } from './environment.js';
import { ReminderDeliveryGateway, type ReminderDeliveryResult, type ReminderSendTextInput } from '../application/ports/reminders/reminder-delivery.gateway.js';
import { WhatsappMediaDownloader, type WhatsappMediaDownloadResult } from '../application/ports/integrations/whatsapp-media.downloader.js';
import { WhatsappReplySender, type WhatsappSendMediaInput, type WhatsappSendTextResult } from '../application/ports/integrations/whatsapp-reply.sender.js';

@Injectable()
export class EvolutionWhatsappReplySender extends WhatsappReplySender {
  async sendText(input: { chatJid: string; text: string }): Promise<WhatsappSendTextResult> {
    const environment = readEnvironment();
    if (!environment.evolutionApiUrl || !environment.evolutionApiKey || !environment.evolutionInstanceName) {
      return { ok: false, error: 'evolution_api_not_configured' };
    }

    const normalizedText = String(input.text || '').trim() || 'I could not build the reply. Please try again.';
    const baseUrl = environment.evolutionApiUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/message/sendText/${encodeURIComponent(environment.evolutionInstanceName)}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: environment.evolutionApiKey,
        },
        body: JSON.stringify({
          number: input.chatJid,
          text: normalizedText,
        }),
      });
      if (!response.ok) return { ok: false, error: `evolution_api_http_${response.status}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async sendMedia(input: WhatsappSendMediaInput): Promise<WhatsappSendTextResult> {
    const environment = readEnvironment();
    if (!environment.evolutionApiUrl || !environment.evolutionApiKey || !environment.evolutionInstanceName) {
      return { ok: false, error: 'evolution_api_not_configured' };
    }

    let mediaValue = input.mediaBase64;
    const isUrl = /^(https?|ftp):\/\//i.test(mediaValue);
    const hasPrefix = mediaValue.startsWith('data:');
    if (!isUrl && !hasPrefix) {
      mediaValue = `data:${input.mimeType || 'application/octet-stream'};base64,${mediaValue}`;
    }

    let fileName = input.fileName || 'attachment';
    if (!fileName.includes('.')) {
      const parts = (input.mimeType || '').split('/');
      if (parts.length === 2) {
        const ext = parts[1].toLowerCase();
        const suffix = ext === 'jpeg' ? 'jpg' : ext;
        fileName = `${fileName}.${suffix}`;
      }
    }

    const baseUrl = environment.evolutionApiUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/message/sendMedia/${encodeURIComponent(environment.evolutionInstanceName)}`;
    const payload: Record<string, unknown> = {
      number: input.chatJid,
      mediatype: input.mediaType,
      mimetype: input.mimeType || 'application/octet-stream',
      media: mediaValue,
      fileName,
    };
    const caption = String(input.caption || '').trim();
    if (caption) payload.caption = caption;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: environment.evolutionApiKey,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) return { ok: false, error: `evolution_api_http_${response.status}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

@Injectable()
export class EvolutionReminderDeliveryGateway extends ReminderDeliveryGateway {
  constructor(private readonly whatsappReplySender: WhatsappReplySender) {
    super();
  }

  async sendText(input: ReminderSendTextInput): Promise<ReminderDeliveryResult> {
    if (input.channel !== ReminderDeliveryChannel.Whatsapp) {
      return { ok: false, error: 'unsupported_reminder_delivery_channel' };
    }

    return this.whatsappReplySender.sendText({
      chatJid: input.recipientId,
      text: input.text,
    });
  }
}

@Injectable()
export class EvolutionWhatsappMediaDownloader extends WhatsappMediaDownloader {
  async downloadBase64(input: { body: Record<string, unknown> }): Promise<WhatsappMediaDownloadResult> {
    const environment = readEnvironment();
    if (!environment.evolutionApiUrl || !environment.evolutionApiKey || !environment.evolutionInstanceName) {
      return { ok: false, error: 'evolution_api_not_configured' };
    }

    const baseUrl = environment.evolutionApiUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(environment.evolutionInstanceName)}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: environment.evolutionApiKey,
        },
        body: JSON.stringify({ message: evolutionMessagePayload(input.body) }),
      });
      if (!response.ok) return { ok: false, error: `evolution_api_http_${response.status}` };
      const json = await response.json() as Record<string, unknown>;
      const dataBase64 = extractBase64(json);
      return dataBase64 ? { ok: true, dataBase64 } : { ok: false, error: 'evolution_media_base64_missing' };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

function evolutionMessagePayload(body: Record<string, unknown>): Record<string, unknown> {
  const data = body.data;
  if (Array.isArray(data)) {
    const first = data.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
    return first ? first as Record<string, unknown> : body;
  }
  if (data && typeof data === 'object') return data as Record<string, unknown>;
  return body;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function base64Value(value: unknown): string {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const marker = ';base64,';
  const markerIndex = raw.indexOf(marker);
  return markerIndex >= 0 ? raw.slice(markerIndex + marker.length).trim() : raw;
}

function extractBase64(json: Record<string, unknown>): string {
  const data = objectValue(json.data);
  const response = objectValue(json.response);
  return base64Value(
    json.base64 ||
      data?.base64 ||
      response?.base64,
  );
}

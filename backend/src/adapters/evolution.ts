import { Injectable } from '@nestjs/common';

import { ReminderDeliveryChannel } from '../contracts/enums.js';
import { ReminderDeliveryGateway, type ReminderDeliveryResult, type ReminderSendTextInput } from '../application/ports/reminders/reminder-delivery.gateway.js';
import { WhatsappMediaDownloader, type WhatsappMediaDownloadResult } from '../application/ports/integrations/whatsapp-media.downloader.js';
import { WhatsappReplySender, type WhatsappSendMediaInput, type WhatsappSendTextResult } from '../application/ports/integrations/whatsapp-reply.sender.js';
import { AppLogger } from '../observability/logger.js';
import {
  buildEvolutionUrl,
  evolutionMessagePayload,
  extractBase64,
  getEvolutionConfig,
  processMediaInput,
  type EvolutionMessageBody,
} from './evolution/evolution.helpers.js';

@Injectable()
export class EvolutionWhatsappReplySender extends WhatsappReplySender {
  constructor(private readonly logger?: AppLogger) {
    super();
  }
  async sendText(input: { chatJid: string; text: string }): Promise<WhatsappSendTextResult> {
    const config = getEvolutionConfig();
    if (!config) {
      return { ok: false, error: 'evolution_api_not_configured' };
    }

    const normalizedText = String(input.text || '').trim();
    if (!normalizedText) {
      return { ok: false, error: 'empty_text' };
    }

    const url = buildEvolutionUrl(config, 'message/sendText');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: config.apiKey,
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
    const config = getEvolutionConfig();
    if (!config) {
      return { ok: false, error: 'evolution_api_not_configured' };
    }

    if (!input.mimeType) {
      return { ok: false, error: 'missing_mime_type' };
    }

    const { mediaValue, fileName, isUrl } = processMediaInput({
      mediaBase64: input.mediaBase64,
      fileName: input.fileName,
      mimeType: input.mimeType,
      mediaType: input.mediaType,
      caption: input.caption,
    });

    const isAudio = input.mediaType === 'audio';
    const endpoint = isAudio ? 'message/sendWhatsAppAudio' : 'message/sendMedia';
    const url = buildEvolutionUrl(config, endpoint);

    const payload: Record<string, unknown> = isAudio
      ? {
          number: input.chatJid,
          audio: mediaValue,
          options: {
            delay: 1200,
            encoding: !isUrl,
          },
        }
      : {
          number: input.chatJid,
          mediatype: input.mediaType,
          mimetype: input.mimeType,
          media: mediaValue,
          fileName,
        };

    const caption = String(input.caption || '').trim();
    if (!isAudio && caption) payload.caption = caption;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: config.apiKey,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        this.logger?.error('whatsapp.send_media.failed', {
          status: response.status,
          errorBody,
          chatJid: input.chatJid,
          mediaType: input.mediaType,
          mimeType: input.mimeType,
          fileName,
          mediaPrefix: typeof mediaValue === 'string' ? mediaValue.slice(0, 100) : ''
        });
        return { ok: false, error: `evolution_api_http_${response.status}` };
      }
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
    const config = getEvolutionConfig();
    if (!config) {
      return { ok: false, error: 'evolution_api_not_configured' };
    }

    const url = buildEvolutionUrl(config, 'chat/getBase64FromMediaMessage');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: config.apiKey,
        },
        body: JSON.stringify({ message: evolutionMessagePayload(input.body as EvolutionMessageBody) }),
      });
      if (!response.ok) return { ok: false, error: `evolution_api_http_${response.status}` };
      const json = await response.json() as EvolutionMessageBody;
      const dataBase64 = extractBase64(json);
      return dataBase64 ? { ok: true, dataBase64 } : { ok: false, error: 'evolution_media_base64_missing' };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}


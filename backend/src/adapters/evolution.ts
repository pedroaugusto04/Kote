import { Injectable } from '@nestjs/common';

import { readEnvironment } from './environment.js';
import { WhatsappReplySender, type WhatsappSendTextResult } from '../application/ports/whatsapp-reply.sender.js';

@Injectable()
export class EvolutionWhatsappReplySender extends WhatsappReplySender {
  async sendText(input: { groupJid: string; text: string }): Promise<WhatsappSendTextResult> {
    const environment = readEnvironment();
    if (!environment.evolutionApiUrl || !environment.evolutionApiKey || !environment.evolutionInstanceName) {
      return { ok: false, error: 'evolution_api_not_configured' };
    }

    const normalizedText = String(input.text || '').trim() || 'Nao consegui montar a resposta. Tente novamente.';
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
          number: input.groupJid,
          text: normalizedText,
        }),
      });
      if (!response.ok) return { ok: false, error: `evolution_api_http_${response.status}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

import { WhatsappMediaType } from '../../../contracts/enums.js';

export type WhatsappSendTextResult = {
  ok: boolean;
  error?: string;
};

export { WhatsappMediaType };

export type WhatsappSendMediaInput = {
  chatJid: string;
  mediaType: WhatsappMediaType;
  mimeType: string;
  fileName: string;
  mediaBase64: string;
  caption?: string;
};

export abstract class WhatsappReplySender {
  abstract sendText(input: { chatJid: string; text: string }): Promise<WhatsappSendTextResult>;
  abstract sendMedia(input: WhatsappSendMediaInput): Promise<WhatsappSendTextResult>;
}

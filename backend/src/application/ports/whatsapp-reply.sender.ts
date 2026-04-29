export type WhatsappSendTextResult = {
  ok: boolean;
  error?: string;
};

export abstract class WhatsappReplySender {
  abstract sendText(input: { groupJid: string; text: string }): Promise<WhatsappSendTextResult>;
}

export type TelegramSendTextResult = {
  ok: boolean;
  error?: string;
};

export abstract class TelegramMessageSender {
  abstract sendText(input: { chatId: string; text: string }): Promise<TelegramSendTextResult>;
}

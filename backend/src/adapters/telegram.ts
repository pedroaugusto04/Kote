import { Injectable } from '@nestjs/common';

import { ReminderDeliveryChannel } from '../contracts/enums.js';
import { readEnvironment } from './environment.js';
import { ReminderDeliveryGateway, type ReminderDeliveryResult, type ReminderSendTextInput } from '../application/ports/reminders/reminder-delivery.gateway.js';
import { TelegramMessageSender, type TelegramSendTextResult } from '../application/ports/integrations/telegram-message.sender.js';

@Injectable()
export class TelegramHttpMessageSender extends TelegramMessageSender {
  async sendText(input: { chatId: string; text: string }): Promise<TelegramSendTextResult> {
    const environment = readEnvironment();
    if (!environment.telegramBotToken) {
      return { ok: false, error: 'telegram_bot_token_not_configured' };
    }

    const url = `https://api.telegram.org/bot${environment.telegramBotToken}/sendMessage`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
        }),
      });
      if (!response.ok) return { ok: false, error: `telegram_api_http_${response.status}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

@Injectable()
export class TelegramReminderDeliveryGateway extends ReminderDeliveryGateway {
  constructor(private readonly telegramMessageSender: TelegramMessageSender) {
    super();
  }

  async sendText(input: ReminderSendTextInput): Promise<ReminderDeliveryResult> {
    if (input.channel !== ReminderDeliveryChannel.Telegram) {
      return { ok: false, error: 'unsupported_reminder_delivery_channel' };
    }

    return this.telegramMessageSender.sendText({
      chatId: input.recipientId,
      text: input.text,
    });
  }
}

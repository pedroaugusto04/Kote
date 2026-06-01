import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ReminderEventBus } from './reminder-event.bus.js';
import { TelegramMessageSender } from '../ports/integrations/telegram-message.sender.js';
import { ReminderDeliveryChannel } from '../../contracts/enums.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../observability/logger.js';

@Injectable()
export class TelegramReminderListener implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly eventBus: ReminderEventBus,
    private readonly telegramSender: TelegramMessageSender,
    private readonly envProvider: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    this.eventBus.on('reminder.sent', this.handleReminderSent);
  }

  onModuleDestroy() {
    this.eventBus.off('reminder.sent', this.handleReminderSent);
  }

  private handleReminderSent = async (payload: {
    userId: string;
    workspaceSlug: string;
    channel: ReminderDeliveryChannel;
    noteTitle: string;
    project: string;
    text: string;
    noteId?: string;
  }) => {
    // We cross-dispatch WhatsApp/Push reminders to Telegram for reliable notification delivery
    if (payload.channel !== ReminderDeliveryChannel.Whatsapp) {
      return;
    }

    const chatId = this.envProvider.read().telegramChatId;
    if (!chatId) {
      return;
    }

    const baseUrl = this.envProvider.read().publicBaseUrl;
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const path = payload.noteId
      ? `/vault/${payload.noteId}`
      : `/workspaces/${payload.workspaceSlug}/reminders`;
    const url = `${cleanBase}${path}`;

    const projectLabel = payload.project ? `[${payload.project}] ` : '';
    const textMsg = [
      `🔔 Lembrete: ${payload.noteTitle}`,
      payload.project ? `Projeto: ${payload.project}` : '',
      '',
      payload.text,
      '',
      `🔗 Link: ${url}`,
    ]
      .filter((line) => line !== '')
      .join('\n')
      .trim();

    try {
      const result = await this.telegramSender.sendText({
        chatId,
        text: textMsg,
      });
      if (!result.ok) {
        this.logger.error('telegram_reminder_listener.send_failed', {
          error: result.error || 'unknown_error',
          userId: payload.userId,
          noteId: payload.noteId,
        });
      }
    } catch (error) {
      this.logger.error('telegram_reminder_listener.exception', {
        error: error instanceof Error ? error.message : String(error),
        userId: payload.userId,
        noteId: payload.noteId,
      });
    }
  };
}

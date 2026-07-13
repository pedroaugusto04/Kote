import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ReminderEventBus } from '../event-buses/reminder-event.bus.js';
import { TelegramMessageSender } from '../ports/integrations/telegram-message.sender.js';
import { ReminderDeliveryChannel, IntegrationProvider, CredentialRecordStatus } from '../../contracts/enums.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../observability/logger.js';
import { ContentRepository } from '../ports/notes/content.repository.js';
import { CredentialRepository } from '../ports/integrations/integrations.repository.js';

@Injectable()
export class TelegramReminderListener implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly eventBus: ReminderEventBus,
    private readonly telegramSender: TelegramMessageSender,
    private readonly envProvider: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
    private readonly contentRepository: ContentRepository,
    private readonly credentialsRepository: CredentialRepository,
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

    // Verify if there is an integration credential status for Telegram
    const record = await this.credentialsRepository.findCredential(
      payload.userId,
      payload.workspaceSlug,
      IntegrationProvider.Telegram,
    );

    const isRevoked = record && (record.revokedAt || record.status !== CredentialRecordStatus.Connected);
    if (isRevoked) {
      this.logger.debug?.('telegram_reminder_listener.skipped_revoked', {
        userId: payload.userId,
        workspaceSlug: payload.workspaceSlug,
      });
      return;
    }

    // Resolve workspace specific chatId if available
    let workspaceChatId = '';
    try {
      const workspaces = await this.contentRepository.listWorkspaces(payload.userId);
      const workspace = workspaces.find((w) => w.workspaceSlug === payload.workspaceSlug);
      if (workspace?.telegramChatId) {
        workspaceChatId = workspace.telegramChatId;
      }
    } catch (error) {
      this.logger.error('telegram_reminder_listener.fetch_workspace_failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: payload.userId,
        workspaceSlug: payload.workspaceSlug,
      });
    }

    const isConnected = record && record.status === CredentialRecordStatus.Connected && !record.revokedAt;
    const envChatId = this.envProvider.read().telegramChatId;
    
    // Only fall back to envChatId if there is no explicit credential at all (e.g. system env-only setup)
    // If the integration is connected but has no workspaceChatId, we don't fall back to avoid cross-dispatching to public env channels.
    const chatId = workspaceChatId || (isConnected ? '' : envChatId);

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

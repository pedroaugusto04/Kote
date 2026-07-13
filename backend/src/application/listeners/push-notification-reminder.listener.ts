import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ReminderEventBus } from '../event-buses/reminder-event.bus.js';
import { PushNotificationService } from '../services/notifications/push-notification.service.js';
import { ReminderDeliveryChannel } from '../../contracts/enums.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../observability/logger.js';

@Injectable()
export class PushNotificationReminderListener implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly eventBus: ReminderEventBus,
    private readonly pushService: PushNotificationService,
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
    // We only cross-dispatch browser push notifications for WhatsApp reminders
    if (payload.channel !== ReminderDeliveryChannel.Whatsapp) {
      return;
    }

    const projectLabel = payload.project ? `[${payload.project}] ` : '';
    const body = `${projectLabel}${payload.text}`.trim().slice(0, 180);

    const baseUrl = this.envProvider.read().publicBaseUrl;
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const path = payload.noteId
      ? `/vault/${payload.noteId}`
      : `/workspaces/${payload.workspaceSlug}/reminders`;
    const url = `${cleanBase}${path}`;

    try {
      await this.pushService.sendToUser(payload.userId, {
        title: `Lembrete: ${payload.noteTitle}`,
        body: body || 'Clique para ver o lembrete.',
        url,
      });
    } catch (error) {
      this.logger.error('push_notification_reminder_listener.exception', {
        error: error instanceof Error ? error.message : String(error),
        userId: payload.userId,
        noteId: payload.noteId,
      });
    }
  };
}

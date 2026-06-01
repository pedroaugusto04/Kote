import { Injectable, OnModuleInit } from '@nestjs/common';
import { ReminderEventBus } from './reminder-event.bus.js';
import { PushNotificationService } from './push-notification.service.js';
import { ReminderDeliveryChannel } from '../../contracts/enums.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';

@Injectable()
export class PushNotificationReminderListener implements OnModuleInit {
  constructor(
    private readonly eventBus: ReminderEventBus,
    private readonly pushService: PushNotificationService,
    private readonly envProvider: RuntimeEnvironmentProvider,
  ) {}

  onModuleInit() {
    this.eventBus.on(
      'reminder.sent',
      (payload: {
        userId: string;
        workspaceSlug: string;
        channel: ReminderDeliveryChannel;
        noteTitle: string;
        project: string;
        text: string;
      }) => {
        // We only cross-dispatch browser push notifications for WhatsApp reminders
        if (payload.channel === ReminderDeliveryChannel.Whatsapp) {
          const projectLabel = payload.project ? `[${payload.project}] ` : '';
          const body = `${projectLabel}${payload.text}`.trim().slice(0, 180);

          const base = this.envProvider.read().frontendBasePath;
          const cleanBase = base.startsWith('/') ? base : `/${base}`;
          const normalizedBase = cleanBase.endsWith('/') ? cleanBase : `${cleanBase}/`;
          const url = `${normalizedBase}workspaces/${payload.workspaceSlug}/reminders`;

          void this.pushService.sendToUser(payload.userId, {
            title: `Lembrete: ${payload.noteTitle}`,
            body: body || 'Clique para ver o lembrete.',
            url,
          });
        }
      },
    );
  }
}

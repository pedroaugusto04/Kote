import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { EnvModule } from './env.module.js';
import { DatabaseModule } from './database.module.js';

import {
  BuildReminderDispatchUseCase,
  DispatchDueRemindersUseCase,
  DispatchDueTelegramRemindersUseCase,
  MarkReminderAsSentUseCase,
  RefreshReminderStatusesUseCase,
  UpdateReminderStatusUseCase,
  ListPaginatedRemindersUseCase,
  ListReminderBoardUseCase,
} from '../../application/use-cases/index.js';

import { ReminderDispatchWorker } from '../../application/services/reminder-dispatch.worker.js';
import { ReminderEventBus } from '../../application/services/reminder-event.bus.js';
import { PushNotificationService } from '../../application/services/push-notification.service.js';
import { PushNotificationReminderListener } from '../../application/services/push-notification-reminder.listener.js';
import { TelegramReminderListener } from '../../application/services/telegram-reminder.listener.js';
import { VapidService } from '../../application/services/vapid.service.js';

import { WhatsappReplySender } from '../../application/ports/integrations/whatsapp-reply.sender.js';
import { WhatsappMediaDownloader } from '../../application/ports/integrations/whatsapp-media.downloader.js';
import { TelegramMessageSender } from '../../application/ports/integrations/telegram-message.sender.js';
import { ReminderDeliveryGateway } from '../../application/ports/reminders/reminder-delivery.gateway.js';

import { EvolutionWhatsappReplySender, EvolutionReminderDeliveryGateway, EvolutionWhatsappMediaDownloader } from '../../adapters/evolution.js';
import { TelegramHttpMessageSender, TelegramReminderDeliveryGateway } from '../../adapters/telegram.js';

@Module({
  imports: [
    LoggerModule,
    EnvModule,
    DatabaseModule,
  ],
  providers: [
    BuildReminderDispatchUseCase,
    DispatchDueRemindersUseCase,
    DispatchDueTelegramRemindersUseCase,
    MarkReminderAsSentUseCase,
    RefreshReminderStatusesUseCase,
    UpdateReminderStatusUseCase,
    ListPaginatedRemindersUseCase,
    ListReminderBoardUseCase,
    ReminderDispatchWorker,
    ReminderEventBus,
    PushNotificationService,
    PushNotificationReminderListener,
    TelegramReminderListener,
    VapidService,
    EvolutionWhatsappReplySender,
    EvolutionReminderDeliveryGateway,
    EvolutionWhatsappMediaDownloader,
    TelegramHttpMessageSender,
    TelegramReminderDeliveryGateway,
    { provide: WhatsappReplySender, useExisting: EvolutionWhatsappReplySender },
    { provide: WhatsappMediaDownloader, useExisting: EvolutionWhatsappMediaDownloader },
    { provide: TelegramMessageSender, useExisting: TelegramHttpMessageSender },
    { provide: ReminderDeliveryGateway, useExisting: EvolutionReminderDeliveryGateway },
  ],
  exports: [
    BuildReminderDispatchUseCase,
    MarkReminderAsSentUseCase,
    ReminderEventBus,
    PushNotificationService,
    VapidService,
    WhatsappReplySender,
    WhatsappMediaDownloader,
    TelegramMessageSender,
    ReminderDeliveryGateway,
    RefreshReminderStatusesUseCase,
    ListPaginatedRemindersUseCase,
    ListReminderBoardUseCase,
    UpdateReminderStatusUseCase,
  ],
})
export class RemindersModule {}

import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module.js';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { RemindersModule } from './reminders.module.js';

import {
  ListPushSubscriptionsUseCase,
  CreatePushSubscriptionUseCase,
  DeletePushSubscriptionUseCase,
} from '../../application/use-cases/index.js';
import { PushSubscriptionsController } from '../../interfaces/http/controllers/index.js';

@Module({
  imports: [
    LoggerModule,
    DatabaseModule,
    AuthModule,
    RemindersModule,
  ],
  controllers: [
    PushSubscriptionsController,
  ],
  providers: [
    ListPushSubscriptionsUseCase,
    CreatePushSubscriptionUseCase,
    DeletePushSubscriptionUseCase,
  ],
})
export class PushSubscriptionsModule {}

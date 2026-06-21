import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { BillingModule } from './billing.module.js';
import { SubscriptionController } from '../../interfaces/http/controllers/subscription/subscription.controller.js';
import {
  GetPlansUseCase,
  GetSubscriptionStatusUseCase,
  UpdateSubscriptionUseCase,
  CancelPaymentUseCase,
  CancelScheduledChangeUseCase,
} from '../../application/use-cases/index.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BillingModule,
  ],
  controllers: [
    SubscriptionController,
  ],
  providers: [
    GetPlansUseCase,
    GetSubscriptionStatusUseCase,
    UpdateSubscriptionUseCase,
    CancelPaymentUseCase,
    CancelScheduledChangeUseCase,
  ],
})
export class QuotaModule {}

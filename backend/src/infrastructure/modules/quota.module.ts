import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { BillingModule } from './billing.module.js';
import { SubscriptionController } from '../../interfaces/http/controllers/subscription/subscription.controller.js';
import { QuotaService } from '../../application/services/quota.service.js';
import { SubscriptionService } from '../../application/services/billing-stubs.service.js';
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
    QuotaService,
    SubscriptionService,
    GetPlansUseCase,
    GetSubscriptionStatusUseCase,
    UpdateSubscriptionUseCase,
    CancelPaymentUseCase,
    CancelScheduledChangeUseCase,
  ],
})
export class QuotaModule {}

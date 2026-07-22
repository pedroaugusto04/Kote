import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module.js';
import { AuthModule } from './auth.module.js';
import { BillingModule } from './billing.module.js';
import { SubscriptionController } from '../../interfaces/http/controllers/subscription/subscription.controller.js';
import { QuotaService } from '../../application/services/quota/quota.service.js';
import { AiEntitlementService } from '../../application/services/ai/ai-entitlement.service.js';
import {
  GetPlansUseCase,
  GetStripeConfigUseCase,
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
    AiEntitlementService,
    GetPlansUseCase,
    GetStripeConfigUseCase,
    GetSubscriptionStatusUseCase,
    UpdateSubscriptionUseCase,
    CancelPaymentUseCase,
    CancelScheduledChangeUseCase,
  ],
  exports: [
    QuotaService,
    AiEntitlementService,
  ],
})
export class QuotaModule {}

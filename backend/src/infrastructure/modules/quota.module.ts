import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module.js';
import { EnvModule } from './env.module.js';
import { AuthModule } from './auth.module.js';
import { BillingModule } from './billing.module.js';
import { SubscriptionController } from '../../interfaces/http/controllers/subscription/subscription.controller.js';
import { QuotaService } from '../../application/services/quota/quota.service.js';
import { AiEntitlementService } from '../../application/services/ai/ai-entitlement.service.js';
import { BillingEventStreamService } from '../../application/services/billing/billing-event-stream.service.js';
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
    EnvModule,
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
    BillingEventStreamService,
  ],
  exports: [
    QuotaService,
    AiEntitlementService,
  ],
})
export class QuotaModule {}

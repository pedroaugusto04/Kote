import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module.js';
import { LoggerModule } from './logger.module.js';
import { AsaasPaymentGateway } from '../billing/gateways/asaas/AsaasPaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { StripePaymentGateway } from '../billing/gateways/stripe/StripePaymentGateway.js';
import { StripeGatewayStatusMapper } from '../billing/gateways/stripe/StripeGatewayStatusMapper.js';
import { BillingQueuePublisher } from '../../application/ports/billing/billing-queue.publisher.js';
import { RabbitMqBillingQueuePublisher } from '../billing/publishers/RabbitMqBillingQueuePublisher.js';
import { BillingWebhookConsumer } from '../billing/consumers/BillingWebhookConsumer.js';
import { BillingIntentService } from '../../application/services/billing/BillingIntentService.js';
import { SubscriptionService } from '../../application/services/billing/SubscriptionService.js';
import { SubscriptionUpgradeService } from '../../application/services/billing/SubscriptionUpgradeService.js';
import { SubscriptionCancellationService } from '../../application/services/billing/SubscriptionCancellationService.js';
import { SubscriptionChangeService } from '../../application/services/billing/SubscriptionChangeService.js';
import { UpdateSubscriptionStrategyFactory } from '../../application/services/billing/subscriptionStrategy/UpdateSubscriptionStrategyFactory.js';

import { AuthModule } from './auth.module.js';
import { AsaasWebhookController } from '../../interfaces/http/controllers/billing/asaas-webhook.controller.js';
import { StripeWebhookController } from '../../interfaces/http/controllers/billing/stripe-webhook.controller.js';
import { HandleAsaasWebhookUseCase, HandleStripeWebhookUseCase } from '../../application/use-cases/index.js';
import { BillingEventBus } from '../../application/event-buses/billing-event.bus.js';
import { AppLogger } from '../../observability/logger.js';
import { ChangeSubscriptionWorker } from '../../application/workers/change-subscription.worker.js';
import { BillingWorker } from '../../application/workers/billing.worker.js';
import { WebhookOutboxRelayWorker } from '../../application/workers/webhook-outbox-relay.worker.js';

@Module({
  imports: [DatabaseModule, LoggerModule, AuthModule],
  controllers: [AsaasWebhookController, StripeWebhookController],
  providers: [
    AppLogger,
    AsaasPaymentGateway,
    AsaasGatewayStatusMapper,
    StripePaymentGateway,
    StripeGatewayStatusMapper,
    RabbitMqBillingQueuePublisher,
    { provide: BillingQueuePublisher, useExisting: RabbitMqBillingQueuePublisher },
    BillingWebhookConsumer,
    BillingIntentService,
    SubscriptionService,
    SubscriptionUpgradeService,
    SubscriptionCancellationService,
    SubscriptionChangeService,
    UpdateSubscriptionStrategyFactory,
    HandleAsaasWebhookUseCase,
    HandleStripeWebhookUseCase,
    BillingEventBus,
    ChangeSubscriptionWorker,
    BillingWorker,
    WebhookOutboxRelayWorker,
  ],
  exports: [
    AppLogger,
    AsaasPaymentGateway,
    AsaasGatewayStatusMapper,
    StripePaymentGateway,
    StripeGatewayStatusMapper,
    BillingQueuePublisher,
    BillingIntentService,
    SubscriptionService,
    SubscriptionUpgradeService,
    SubscriptionCancellationService,
    SubscriptionChangeService,
    UpdateSubscriptionStrategyFactory,
    HandleAsaasWebhookUseCase,
    HandleStripeWebhookUseCase,
    BillingEventBus,
  ],
})
export class BillingModule {}

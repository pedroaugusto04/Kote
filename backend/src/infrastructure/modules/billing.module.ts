import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module.js';
import { LoggerModule } from './logger.module.js';
import { AsaasPaymentGateway } from '../billing/gateways/asaas/AsaasPaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { StripePaymentGateway } from '../billing/gateways/stripe/StripePaymentGateway.js';
import { StripeGatewayStatusMapper } from '../billing/gateways/stripe/StripeGatewayStatusMapper.js';
import { BillingQueuePublisher } from '../../application/ports/billing/billing-queue.publisher.js';
import {
  ASAAS_PAYMENT_GATEWAY,
  STRIPE_PAYMENT_GATEWAY,
  ASAAS_STATUS_MAPPER,
  STRIPE_STATUS_MAPPER,
} from '../../application/ports/billing/payment-gateway.port.js';
import { RabbitMqBillingQueuePublisher } from '../billing/publishers/rabbitmq-billing-queue.publisher.js';
import { BillingWebhookConsumer } from '../billing/consumers/billing-webhook.consumer.js';
import { BillingIntentService } from '../../application/services/billing/billing-intent.service.js';
import { SubscriptionService } from '../../application/services/billing/subscription.service.js';
import { SubscriptionUpgradeService } from '../../application/services/billing/subscription-upgrade.service.js';
import { SubscriptionCancellationService } from '../../application/services/billing/subscription-cancellation.service.js';
import { SubscriptionChangeService } from '../../application/services/billing/subscription-change.service.js';
import { UpdateSubscriptionStrategyFactory } from '../../application/services/billing/strategies/update-subscription-strategy.factory.js';

import { AuthModule } from './auth.module.js';
import { AsaasWebhookController } from '../../interfaces/http/controllers/billing/asaas-webhook.controller.js';
import { StripeWebhookController } from '../../interfaces/http/controllers/billing/stripe-webhook.controller.js';
import { HandleAsaasWebhookUseCase, HandleStripeWebhookUseCase } from '../../application/use-cases/index.js';
import { BillingEventBus } from '../../application/event-buses/billing-event.bus.js';
import { ChangeSubscriptionWorker } from '../../application/workers/change-subscription.worker.js';
import { BillingWorker } from '../../application/workers/billing.worker.js';
import { WebhookOutboxRelayWorker } from '../../application/workers/webhook-outbox-relay.worker.js';

import { PaymentGatewayFactory } from '../../application/services/billing/payment-gateway.factory.js';

@Module({
  imports: [DatabaseModule, LoggerModule, AuthModule],
  controllers: [AsaasWebhookController, StripeWebhookController],
  providers: [
    AsaasPaymentGateway,
    AsaasGatewayStatusMapper,
    StripePaymentGateway,
    StripeGatewayStatusMapper,
    { provide: ASAAS_PAYMENT_GATEWAY, useExisting: AsaasPaymentGateway },
    { provide: STRIPE_PAYMENT_GATEWAY, useExisting: StripePaymentGateway },
    { provide: ASAAS_STATUS_MAPPER, useExisting: AsaasGatewayStatusMapper },
    { provide: STRIPE_STATUS_MAPPER, useExisting: StripeGatewayStatusMapper },
    PaymentGatewayFactory,
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
    AsaasPaymentGateway,
    AsaasGatewayStatusMapper,
    StripePaymentGateway,
    StripeGatewayStatusMapper,
    ASAAS_PAYMENT_GATEWAY,
    STRIPE_PAYMENT_GATEWAY,
    ASAAS_STATUS_MAPPER,
    STRIPE_STATUS_MAPPER,
    PaymentGatewayFactory,
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

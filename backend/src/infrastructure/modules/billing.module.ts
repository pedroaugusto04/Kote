import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module.js';
import { LoggerModule } from './logger.module.js';
import { AsaasPaymentGateway } from '../billing/gateways/asaas/AsaasPaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { StripePaymentGateway } from '../billing/gateways/stripe/StripePaymentGateway.js';
import { BillingQueuePublisher } from '../../application/ports/billing/billing-queue.publisher.js';
import { RabbitMqBillingQueuePublisher } from '../billing/publishers/RabbitMqBillingQueuePublisher.js';
import { BillingWebhookConsumer } from '../billing/consumers/BillingWebhookConsumer.js';
import { SubscriptionService, BillingIntentService } from '../../application/services/billing-stubs.service.js';
import { AsaasWebhookController } from '../../interfaces/http/controllers/billing/asaas-webhook.controller.js';
import { StripeWebhookController } from '../../interfaces/http/controllers/billing/stripe-webhook.controller.js';
import { HandleAsaasWebhookUseCase, HandleStripeWebhookUseCase } from '../../application/use-cases/index.js';
import { BillingEventBus } from '../../application/services/billing-event.bus.js';

@Module({
  imports: [DatabaseModule, LoggerModule],
  controllers: [AsaasWebhookController, StripeWebhookController],
  providers: [
    AsaasPaymentGateway,
    AsaasGatewayStatusMapper,
    StripePaymentGateway,
    RabbitMqBillingQueuePublisher,
    { provide: BillingQueuePublisher, useExisting: RabbitMqBillingQueuePublisher },
    BillingWebhookConsumer,
    SubscriptionService,
    BillingIntentService,
    HandleAsaasWebhookUseCase,
    HandleStripeWebhookUseCase,
    BillingEventBus,
  ],
  exports: [
    AsaasPaymentGateway,
    AsaasGatewayStatusMapper,
    StripePaymentGateway,
    BillingQueuePublisher,
    SubscriptionService,
    BillingIntentService,
    HandleAsaasWebhookUseCase,
    HandleStripeWebhookUseCase,
    BillingEventBus,
  ],
})
export class BillingModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module.js';
import { LoggerModule } from './logger.module.js';
import { AsaasPaymentGateway } from '../billing/gateways/asaas/AsaasPaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { BillingQueuePublisher } from '../../application/ports/billing/billing-queue.publisher.js';
import { RabbitMqBillingQueuePublisher } from '../billing/publishers/RabbitMqBillingQueuePublisher.js';
import { BillingWebhookConsumer } from '../billing/consumers/BillingWebhookConsumer.js';
import { SubscriptionService, BillingIntentService } from '../../application/services/billing-stubs.service.js';
import { AsaasWebhookController } from '../../interfaces/http/controllers/billing/asaas-webhook.controller.js';
import { HandleAsaasWebhookUseCase } from '../../application/use-cases/index.js';
import { BillingEventBus } from '../../application/services/billing-event.bus.js';

@Module({
  imports: [DatabaseModule, LoggerModule],
  controllers: [AsaasWebhookController],
  providers: [
    AsaasPaymentGateway,
    AsaasGatewayStatusMapper,
    RabbitMqBillingQueuePublisher,
    { provide: BillingQueuePublisher, useExisting: RabbitMqBillingQueuePublisher },
    BillingWebhookConsumer,
    SubscriptionService,
    BillingIntentService,
    HandleAsaasWebhookUseCase,
    BillingEventBus,
  ],
  exports: [
    AsaasPaymentGateway,
    AsaasGatewayStatusMapper,
    BillingQueuePublisher,
    SubscriptionService,
    BillingIntentService,
    HandleAsaasWebhookUseCase,
    BillingEventBus,
  ],
})
export class BillingModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module.js';
import { LoggerModule } from './logger.module.js';
import { AsaasPaymentGateway } from '../billing/gateways/asaas/AsaasPaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { BillingQueuePublisher } from '../../application/ports/billing/billing-queue.publisher.js';
import { RabbitMqBillingQueuePublisher } from '../billing/publishers/RabbitMqBillingQueuePublisher.js';
import { BillingWebhookConsumer } from '../billing/consumers/BillingWebhookConsumer.js';
import { SubscriptionService, BillingIntentService } from '../../application/services/billing-stubs.service.js';

@Module({
  imports: [DatabaseModule, LoggerModule],
  providers: [
    AsaasPaymentGateway,
    AsaasGatewayStatusMapper,
    RabbitMqBillingQueuePublisher,
    { provide: BillingQueuePublisher, useExisting: RabbitMqBillingQueuePublisher },
    BillingWebhookConsumer,
    SubscriptionService,
    BillingIntentService,
  ],
  exports: [
    AsaasPaymentGateway,
    AsaasGatewayStatusMapper,
    BillingQueuePublisher,
    SubscriptionService,
    BillingIntentService,
  ],
})
export class BillingModule {}

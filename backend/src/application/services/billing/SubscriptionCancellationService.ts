import { Injectable, BadRequestException } from '@nestjs/common';
import { SubscriptionStatus, PaymentStatus } from '../../../domain/enums/billing.enums.js';
import { AsaasPaymentGateway } from '../../../infrastructure/billing/gateways/asaas/AsaasPaymentGateway.js';
import { StripePaymentGateway } from '../../../infrastructure/billing/gateways/stripe/StripePaymentGateway.js';
import { AppLogger } from '../../../observability/logger.js';
import { BillingIntentService } from './BillingIntentService.js';
import { PAYMENT_GATEWAY } from '../../../domain/constants/billing.constants.js';
import { SubscriptionRepository, BillingPaymentRepository } from '../../ports/billing/billing-repositories.js';

@Injectable()
export class SubscriptionCancellationService {
  constructor(
    private readonly logger: AppLogger,
    private readonly asaasPaymentGateway: AsaasPaymentGateway,
    private readonly stripePaymentGateway: StripePaymentGateway,
    private readonly billingIntentService: BillingIntentService,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly billingPaymentRepository: BillingPaymentRepository,
  ) {}

  async cancelPendingPayment(userId: string, paymentId: string) {
    const payment = await this.billingPaymentRepository.getPaymentById(paymentId);
    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    this.logger.info(`Canceling payment ${paymentId} for user ${userId}, gateway: ${payment.gateway}, gatewayPaymentId: ${payment.gatewayPaymentId}, status: ${payment.status}, kind: ${payment.kind}`);

    // Validation: only PENDING or OVERDUE payments can be canceled
    if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.OVERDUE) {
      throw new BadRequestException('Only pending or overdue payments can be canceled');
    }

    // Validation: only UPGRADE type payments can be manually canceled
    if (payment.kind !== 'upgrade') {
      throw new BadRequestException('Only manually created charges can be canceled');
    }

    const gateway = payment.gateway === PAYMENT_GATEWAY.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    try {
      await gateway.cancelPayment(payment.gatewayPaymentId);
      this.logger.info(`Successfully canceled payment ${paymentId} on gateway`);
    } catch (e: any) {
      this.logger.error(`Failed to cancel payment ${paymentId} on gateway: ${e.message}`, e.stack || '');
      throw new BadRequestException('Failed to cancel payment on gateway. Please try again later.');
    }

    await this.billingPaymentRepository.updatePaymentStatus(paymentId, PaymentStatus.CANCELED);

    const sub = await this.subscriptionRepository.getSubscriptionByUserId(userId);
    if (sub && sub.status === SubscriptionStatus.PENDING) {
      await this.subscriptionRepository.upsertUserSubscription(userId, { status: SubscriptionStatus.CANCELED });
    }

    await this.billingIntentService.cancelLatestPendingOneShotIntent(userId);
  }

  async cancelSubscription(userId: string) {
    const sub = await this.subscriptionRepository.getSubscriptionByUserId(userId);
    if (!sub) {
      throw new BadRequestException('Subscription not found');
    }

    if (!sub.gatewaySubscriptionId) {
      throw new BadRequestException('No gateway subscription to cancel');
    }

    const gateway = sub.gatewayName === PAYMENT_GATEWAY.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    try {
      await gateway.cancelSubscription(sub.gatewaySubscriptionId);
    } catch (e: any) {
      this.logger.error(`Failed to cancel subscription on gateway: ${e.message}`);
      throw new BadRequestException('Failed to cancel subscription on gateway. Please try again later.');
    }

    const openPayments = await this.billingPaymentRepository.getOpenPaymentsByUserId(userId);
    
    for (const payment of openPayments) {
      try {
        await gateway.cancelPayment(payment.gatewayPaymentId);
      } catch (e: any) {
        this.logger.error(`Failed to cancel payment ${payment.gatewayPaymentId} on gateway: ${e.message}`);
        throw new BadRequestException('Failed to cancel payment on gateway. Please try again later.');
      }
      await this.billingPaymentRepository.updatePaymentStatus(payment.id, PaymentStatus.CANCELED);
    }

    await this.subscriptionRepository.upsertUserSubscription(userId, {
      status: SubscriptionStatus.CANCELED,
      canceledAt: new Date(),
    });

    await this.billingIntentService.cancelLatestPendingOneShotIntent(userId);
  }

  async disableSubscription(userId: string) {
    const sub = await this.subscriptionRepository.getSubscriptionByUserId(userId);
    if (!sub) {
      throw new BadRequestException('Subscription not found');
    }

    if (!sub.gatewaySubscriptionId) {
      throw new BadRequestException('No gateway subscription to disable');
    }

    const gateway = sub.gatewayName === PAYMENT_GATEWAY.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    try {
      await gateway.cancelSubscription(sub.gatewaySubscriptionId);
    } catch (e: any) {
      this.logger.error(`Failed to cancel subscription on gateway: ${e.message}`);
      throw new BadRequestException('Failed to cancel subscription on gateway. Please try again later.');
    }

    const openPayments = await this.billingPaymentRepository.getOpenPaymentsByUserId(userId);
    
    for (const payment of openPayments) {
      try {
        await gateway.cancelPayment(payment.gatewayPaymentId);
      } catch (e: any) {
        this.logger.error(`Failed to cancel payment ${payment.gatewayPaymentId} on gateway: ${e.message}`);
        throw new BadRequestException('Failed to cancel payment on gateway. Please try again later.');
      }
      await this.billingPaymentRepository.updatePaymentStatus(payment.id, PaymentStatus.CANCELED);
    }

    await this.subscriptionRepository.upsertUserSubscription(userId, {
      status: SubscriptionStatus.INACTIVE,
      canceledAt: new Date(),
    });

    await this.billingIntentService.cancelLatestPendingOneShotIntent(userId);
  }
}

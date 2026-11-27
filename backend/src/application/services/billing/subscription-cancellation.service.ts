import { Injectable } from '@nestjs/common';
import { SubscriptionStatus, PaymentStatus } from '../../../domain/enums/billing.enums.js';
import {
  AppErrorCode,
  BillingRuleException,
  PaymentGatewayException,
  PaymentNotFoundException,
  SubscriptionNotFoundException,
} from '../../../domain/exceptions/index.js';
import { AppLogger } from '../../../observability/logger.js';
import { BillingIntentService } from './billing-intent.service.js';
import { PaymentGatewayFactory } from './payment-gateway.factory.js';
import { SubscriptionRepository, BillingPaymentRepository } from '../../ports/billing/billing-repositories.js';

@Injectable()
export class SubscriptionCancellationService {
  constructor(
    private readonly logger: AppLogger,
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
    private readonly billingIntentService: BillingIntentService,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly billingPaymentRepository: BillingPaymentRepository,
  ) {}

  async cancelPendingPayment(userId: string, paymentId: string) {
    const payment = await this.billingPaymentRepository.getPaymentById(paymentId);
    if (!payment) {
      throw new PaymentNotFoundException();
    }

    this.logger.info(`Canceling payment ${paymentId} for user ${userId}, gateway: ${payment.gateway}, gatewayPaymentId: ${payment.gatewayPaymentId}, status: ${payment.status}, kind: ${payment.kind}`);

    if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.OVERDUE) {
      throw new BillingRuleException('Only pending or overdue payments can be canceled');
    }

    if (payment.kind !== 'upgrade') {
      throw new BillingRuleException('Only manually created charges can be canceled');
    }

    const gateway = this.paymentGatewayFactory.getGateway(payment.gateway);
    try {
      await gateway.cancelPayment(payment.gatewayPaymentId);
      this.logger.info(`Successfully canceled payment ${paymentId} on gateway`);
    } catch (e: any) {
      this.logger.error(`Failed to cancel payment ${paymentId} on gateway: ${e.message}`, e.stack || '');
      throw new PaymentGatewayException(AppErrorCode.PaymentGatewayError, {
        clientMessage: 'Failed to cancel payment on gateway. Please try again later.',
        provider: payment.gateway,
        cause: e,
      });
    }

    await this.billingPaymentRepository.updatePaymentStatus(paymentId, PaymentStatus.CANCELED);

    const sub = await this.subscriptionRepository.getSubscriptionByUserId(userId);
    if (sub && sub.status === SubscriptionStatus.PENDING) {
      await this.subscriptionRepository.upsertUserSubscription(userId, { status: SubscriptionStatus.CANCELED });
    }

    await this.billingIntentService.cancelLatestPendingOneShotIntent(userId);
  }

  async cancelSubscription(userId: string) {
    await this.terminateSubscription(userId, SubscriptionStatus.CANCELED, 'cancel');
  }

  async disableSubscription(userId: string) {
    await this.terminateSubscription(userId, SubscriptionStatus.INACTIVE, 'disable');
  }

  private async terminateSubscription(
    userId: string,
    targetStatus: SubscriptionStatus.CANCELED | SubscriptionStatus.INACTIVE,
    actionLabel: 'cancel' | 'disable',
  ) {
    const sub = await this.subscriptionRepository.getSubscriptionByUserId(userId);
    if (!sub) {
      throw new SubscriptionNotFoundException();
    }

    if (!sub.gatewaySubscriptionId) {
      throw new BillingRuleException(`No gateway subscription to ${actionLabel}`);
    }

    const gateway = this.paymentGatewayFactory.getGateway(sub.gatewayName);
    try {
      await gateway.cancelSubscription(sub.gatewaySubscriptionId);
    } catch (e: any) {
      this.logger.error(`Failed to cancel subscription on gateway: ${e.message}`);
      throw new PaymentGatewayException(AppErrorCode.PaymentGatewayError, {
        clientMessage: 'Failed to cancel subscription on gateway. Please try again later.',
        provider: sub.gatewayName,
        cause: e,
      });
    }

    const openPayments = await this.billingPaymentRepository.getOpenPaymentsByUserId(userId);

    for (const payment of openPayments) {
      try {
        await gateway.cancelPayment(payment.gatewayPaymentId);
      } catch (e: any) {
        this.logger.error(`Failed to cancel payment ${payment.gatewayPaymentId} on gateway: ${e.message}`);
        throw new PaymentGatewayException(AppErrorCode.PaymentGatewayError, {
          clientMessage: 'Failed to cancel payment on gateway. Please try again later.',
          provider: sub.gatewayName,
          cause: e,
        });
      }
      await this.billingPaymentRepository.updatePaymentStatus(payment.id, PaymentStatus.CANCELED);
    }

    await this.subscriptionRepository.upsertUserSubscription(userId, {
      status: targetStatus,
      canceledAt: new Date(),
    });

    await this.billingIntentService.cancelLatestPendingOneShotIntent(userId);
  }
}

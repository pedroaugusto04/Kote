import { Injectable, BadRequestException } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import {
  userSubscriptions,
  billingPayments,
} from '../../../infrastructure/persistence/schema/index.js';
import { SubscriptionStatus, PaymentStatus } from '../../../domain/enums/billing.enums.js';
import { AsaasPaymentGateway } from '../../../infrastructure/billing/gateways/asaas/AsaasPaymentGateway.js';
import { StripePaymentGateway } from '../../../infrastructure/billing/gateways/stripe/StripePaymentGateway.js';
import { AppLogger } from '../../../observability/logger.js';
import { BillingIntentService } from './BillingIntentService.js';
import { PAYMENT_GATEWAY } from '../../../domain/constants/billing.constants.js';
import { BillingSseHub } from '../../../infrastructure/billing/sse/BillingSseHub.js';

@Injectable()
export class SubscriptionCancellationService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly logger: AppLogger,
    private readonly asaasPaymentGateway: AsaasPaymentGateway,
    private readonly stripePaymentGateway: StripePaymentGateway,
    private readonly billingIntentService: BillingIntentService,
    private readonly billingSseHub: BillingSseHub,
  ) {}

  async cancelPendingPayment(userId: string, paymentId: string) {
    const db = this.database.getDb();
    
    const payment = await db.select().from(billingPayments).where(eq(billingPayments.id, paymentId)).limit(1).then(r => r[0] || null);
    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

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
    } catch (e: any) {
      this.logger.error(`Failed to cancel payment on gateway: ${e.message}`);
      throw new BadRequestException('Failed to cancel payment on gateway. Please try again later.');
    }

    await db.update(billingPayments).set({ status: PaymentStatus.CANCELED }).where(eq(billingPayments.id, paymentId));
    
    const sub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1).then(r => r[0] || null);
    if (sub && sub.status === SubscriptionStatus.PENDING) {
      await db.update(userSubscriptions).set({ status: SubscriptionStatus.CANCELED }).where(eq(userSubscriptions.userId, userId));
    }

    await this.billingIntentService.cancelLatestPendingOneShotIntent(userId);

    // Publish SSE update
    this.billingSseHub.publishSubscriptionStatus(userId, { summary: null });
  }

  async cancelSubscription(userId: string) {
    const db = this.database.getDb();
    
    const sub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1).then(r => r[0] || null);
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

    const openPayments = await db.select().from(billingPayments).where(and(
      eq(billingPayments.userId, userId),
      inArray(billingPayments.status, [PaymentStatus.PENDING, PaymentStatus.OVERDUE])
    ));
    
    const canceledPaymentIds: string[] = [];
    for (const payment of openPayments) {
      try {
        await gateway.cancelPayment(payment.gatewayPaymentId);
      } catch (e: any) {
        this.logger.error(`Failed to cancel payment ${payment.gatewayPaymentId} on gateway: ${e.message}`);
        throw new BadRequestException('Failed to cancel payment on gateway. Please try again later.');
      }
      await db.update(billingPayments).set({ status: PaymentStatus.CANCELED }).where(eq(billingPayments.id, payment.id));
      canceledPaymentIds.push(payment.id);
    }

    await db.update(userSubscriptions).set({
      status: SubscriptionStatus.CANCELED,
      canceledAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(userSubscriptions.userId, userId));

    await this.billingIntentService.cancelLatestPendingOneShotIntent(userId);

    // Publish SSE update
    this.billingSseHub.publishSubscriptionStatus(userId, { summary: null });
  }

  async disableSubscription(userId: string) {
    const db = this.database.getDb();
    
    const sub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1).then(r => r[0] || null);
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

    const openPayments = await db.select().from(billingPayments).where(and(
      eq(billingPayments.userId, userId),
      inArray(billingPayments.status, [PaymentStatus.PENDING, PaymentStatus.OVERDUE])
    ));
    
    const canceledPaymentIds: string[] = [];
    for (const payment of openPayments) {
      try {
        await gateway.cancelPayment(payment.gatewayPaymentId);
      } catch (e: any) {
        this.logger.error(`Failed to cancel payment ${payment.gatewayPaymentId} on gateway: ${e.message}`);
        throw new BadRequestException('Failed to cancel payment on gateway. Please try again later.');
      }
      await db.update(billingPayments).set({ status: PaymentStatus.CANCELED }).where(eq(billingPayments.id, payment.id));
      canceledPaymentIds.push(payment.id);
    }

    await db.update(userSubscriptions).set({
      status: SubscriptionStatus.INACTIVE,
      canceledAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(userSubscriptions.userId, userId));

    await this.billingIntentService.cancelLatestPendingOneShotIntent(userId);

    // Publish SSE update
    this.billingSseHub.publishSubscriptionStatus(userId, { summary: null });
  }
}

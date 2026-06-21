import { Injectable, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
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

// Constants for Gateway Names
export const GATEWAY_NAMES = {
  ASAAS: 'asaas',
  STRIPE: 'stripe',
} as const;

@Injectable()
export class SubscriptionCancellationService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly logger: AppLogger,
    private readonly asaasPaymentGateway: AsaasPaymentGateway,
    private readonly stripePaymentGateway: StripePaymentGateway,
    private readonly billingIntentService: BillingIntentService,
  ) {}

  async cancelPendingPayment(userId: string, paymentId: string) {
    const db = this.database.getDb();
    
    const payment = await db.select().from(billingPayments).where(eq(billingPayments.id, paymentId)).limit(1).then(r => r[0] || null);
    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    // Validação: apenas pagamentos PENDING podem ser cancelados
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Apenas pagamentos pendentes podem ser cancelados');
    }

    // Validação: apenas pagamentos de tipo UPGRADE podem ser cancelados manualmente
    if (payment.kind !== 'upgrade') {
      throw new BadRequestException('Apenas cobranças criadas manualmente podem ser canceladas');
    }

    const gateway = payment.gateway === GATEWAY_NAMES.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    try {
      await gateway.cancelPayment(payment.gatewayPaymentId);
    } catch (e: any) {
      this.logger.warn(`Failed to cancel payment on gateway: ${e.message}`);
    }

    await db.update(billingPayments).set({ status: PaymentStatus.CANCELED }).where(eq(billingPayments.id, paymentId));
    
    const sub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1).then(r => r[0] || null);
    if (sub && sub.status === SubscriptionStatus.PENDING) {
      await db.update(userSubscriptions).set({ status: SubscriptionStatus.CANCELED }).where(eq(userSubscriptions.userId, userId));
    }

    await this.billingIntentService.cancelLatestPendingOneShotIntent(userId);
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

    const gateway = sub.gatewayName === GATEWAY_NAMES.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    try {
      await gateway.cancelSubscription(sub.gatewaySubscriptionId);
    } catch (e: any) {
      this.logger.warn(`Failed to cancel subscription on gateway: ${e.message}`);
    }

    const openPayments = await db.select().from(billingPayments).where(and(
      eq(billingPayments.userId, userId),
      eq(billingPayments.status, PaymentStatus.PENDING)
    ));
    
    const canceledPaymentIds: string[] = [];
    for (const payment of openPayments) {
      try {
        await gateway.cancelPayment(payment.gatewayPaymentId);
      } catch (e: any) {
        this.logger.warn(`Failed to cancel payment ${payment.gatewayPaymentId} on gateway: ${e.message}`);
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

    const gateway = sub.gatewayName === GATEWAY_NAMES.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    try {
      await gateway.cancelSubscription(sub.gatewaySubscriptionId);
    } catch (e: any) {
      this.logger.warn(`Failed to cancel subscription on gateway: ${e.message}`);
    }

    const openPayments = await db.select().from(billingPayments).where(and(
      eq(billingPayments.userId, userId),
      eq(billingPayments.status, PaymentStatus.PENDING)
    ));
    
    const canceledPaymentIds: string[] = [];
    for (const payment of openPayments) {
      try {
        await gateway.cancelPayment(payment.gatewayPaymentId);
      } catch (e: any) {
        this.logger.warn(`Failed to cancel payment ${payment.gatewayPaymentId} on gateway: ${e.message}`);
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
  }
}

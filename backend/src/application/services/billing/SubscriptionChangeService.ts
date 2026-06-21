import { Injectable, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import {
  subscriptionChangeRequests,
  userSubscriptions,
  plans,
} from '../../../infrastructure/persistence/schema/index.js';
import { SubscriptionChangeStatus, SubscriptionChangeType, SubscriptionStatus, BillingCycle, BillingType, PaymentStatus } from '../../../domain/enums/billing.enums.js';
import { SubscriptionPlan } from '../../../domain/enums/plans.enums.js';
import { BillingTypeEnum, GatewayNameEnum } from '../../../infrastructure/billing/gateways/IPaymentGateway.js';
import { AsaasPaymentGateway } from '../../../infrastructure/billing/gateways/asaas/AsaasPaymentGateway.js';
import { StripePaymentGateway } from '../../../infrastructure/billing/gateways/stripe/StripePaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../../../infrastructure/billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { StripeGatewayStatusMapper } from '../../../infrastructure/billing/gateways/stripe/StripeGatewayStatusMapper.js';
import { PostgresBillingPaymentRepository } from '../../../infrastructure/repositories/billing.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { SubscriptionCancellationService } from './SubscriptionCancellationService.js';
import crypto from 'node:crypto';

@Injectable()
export class SubscriptionChangeService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly asaasPaymentGateway: AsaasPaymentGateway,
    private readonly stripePaymentGateway: StripePaymentGateway,
    private readonly asaasGatewayStatusMapper: AsaasGatewayStatusMapper,
    private readonly stripeGatewayStatusMapper: StripeGatewayStatusMapper,
    private readonly billingPaymentRepository: PostgresBillingPaymentRepository,
    private readonly logger: AppLogger,
    private readonly subscriptionCancellationService: SubscriptionCancellationService,
  ) {}

  async scheduleChange(params: {
    userId: string;
    fromSubscriptionId: string;
    fromGateway: string;
    fromGatewaySubscriptionId: string;
    toPlanId: string;
    toBillingCycle: BillingCycle;
    toBillingType: BillingType;
    type: SubscriptionChangeType;
    effectiveAt: Date;
  }): Promise<string> {
    const db = this.database.getDb();

    // Check if change of same type is already scheduled
    const existingChange = await db.select().from(subscriptionChangeRequests).where(and(
      eq(subscriptionChangeRequests.userId, params.userId),
      eq(subscriptionChangeRequests.type, params.type as any),
      eq(subscriptionChangeRequests.status, SubscriptionChangeStatus.SCHEDULED as any)
    )).limit(1).then(r => r[0] || null);

    if (existingChange) {
      throw new BadRequestException(`${params.type === SubscriptionChangeType.DOWNGRADE ? 'Downgrade' : 'Cycle change'} is already scheduled`);
    }

    const changeRequest = {
      id: crypto.randomUUID(),
      userId: params.userId,
      fromSubscriptionId: params.fromSubscriptionId,
      fromGateway: params.fromGateway as any,
      fromGatewaySubscriptionId: params.fromGatewaySubscriptionId,
      toPlanId: params.toPlanId,
      toBillingCycle: params.toBillingCycle as any,
      toBillingType: params.toBillingType as any,
      type: params.type as any,
      status: SubscriptionChangeStatus.SCHEDULED as any,
      effectiveAt: params.effectiveAt,
      attempts: 0,
    };

    await db.insert(subscriptionChangeRequests).values(changeRequest);
    return changeRequest.id;
  }

  async cancelScheduledChange(userId: string, changeId: string) {
    const db = this.database.getDb();
    await db.update(subscriptionChangeRequests).set({ status: SubscriptionChangeStatus.CANCELED }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async getScheduledChange(userId: string) {
    const db = this.database.getDb();
    return await db.select().from(subscriptionChangeRequests).where(and(
      eq(subscriptionChangeRequests.userId, userId),
      eq(subscriptionChangeRequests.status, SubscriptionChangeStatus.SCHEDULED as any)
    )).limit(1).then(r => r[0] || null);
  }

  async isChangeScheduled(userId: string, type?: SubscriptionChangeType): Promise<boolean> {
    const db = this.database.getDb();
    const conditions = [
      eq(subscriptionChangeRequests.userId, userId),
      eq(subscriptionChangeRequests.status, SubscriptionChangeStatus.SCHEDULED as any)
    ];

    if (type) {
      conditions.push(eq(subscriptionChangeRequests.type, type as any));
    }

    const existingChange = await db.select().from(subscriptionChangeRequests).where(and(...conditions)).limit(1).then(r => r[0] || null);
    return Boolean(existingChange);
  }

  async applyScheduledChange(changeId: string) {
    const db = this.database.getDb();

    const changeRequest = await db.select().from(subscriptionChangeRequests).where(eq(subscriptionChangeRequests.id, changeId)).limit(1).then(r => r[0] || null);
    if (!changeRequest) {
      throw new BadRequestException('Change request not found');
    }

    if (changeRequest.status !== SubscriptionChangeStatus.SCHEDULED) {
      throw new BadRequestException('Change request is not scheduled');
    }

    const sub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, changeRequest.userId)).limit(1).then(r => r[0] || null);
    if (!sub) {
      throw new BadRequestException('Subscription not found');
    }

    // Check if downgrade to free plan - cancel subscription
    const plan = await db.select().from(plans).where(eq(plans.id, changeRequest.toPlanId)).limit(1).then(r => r[0] || null);
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    if (plan.slug === SubscriptionPlan.FREE) {
      // If downgrade to free plan, cancel subscription in gateway
      await this.subscriptionCancellationService.cancelSubscription(changeRequest.userId);

      await db.update(subscriptionChangeRequests).set({
        status: SubscriptionChangeStatus.APPLIED,
        updatedAt: new Date(),
      }).where(eq(subscriptionChangeRequests.id, changeId));

      return;
    }

    // Update subscription in gateway
    const gateway = changeRequest.fromGateway === 'stripe' ? this.stripePaymentGateway : this.asaasPaymentGateway;
    const billingCycle = (changeRequest.toBillingCycle as string) === 'yearly' ? BillingCycle.YEARLY : BillingCycle.MONTHLY;
    const targetRecurringValue = this.resolvePlanValueForCycle(plan, billingCycle);
    
    if (!sub.gatewaySubscriptionId) {
      this.logger.warn(`Subscription ${sub.userId} does not have gatewaySubscriptionId, skipping gateway update`);
    } else {
      try {
        await gateway.updateSubscription(sub.gatewaySubscriptionId, {
          value: targetRecurringValue,
          cycle: billingCycle === BillingCycle.YEARLY ? 'yearly' : 'monthly',
          billingType: changeRequest.toBillingType === BillingType.PIX ? BillingTypeEnum.PIX : changeRequest.toBillingType === BillingType.BOLETO ? BillingTypeEnum.BOLETO : BillingTypeEnum.CREDIT_CARD,
          updatePendingPayments: true,
        });

        // Sync pending payments after change
        await this.syncPendingRecurringPaymentsAfterUpgrade(
          { id: sub.userId, userId: changeRequest.userId, gatewaySubscriptionId: sub.gatewaySubscriptionId, gatewayName: sub.gatewayName },
          targetRecurringValue
        );

        this.logger.info(`Subscription ${sub.userId} updated in gateway to plan ${plan.id} with cycle ${changeRequest.toBillingCycle}`);
      } catch (err: any) {
        this.logger.error(`Failed to update subscription in gateway: ${err.message}`);
        // Continue with local update even if gateway fails
      }
    }

    // Update locally
    await db.update(userSubscriptions).set({
      planId: changeRequest.toPlanId,
      billingCycle: changeRequest.toBillingCycle,
      billingType: changeRequest.toBillingType,
      updatedAt: new Date(),
    }).where(eq(userSubscriptions.userId, changeRequest.userId));

    await db.update(subscriptionChangeRequests).set({
      status: SubscriptionChangeStatus.APPLIED,
      updatedAt: new Date(),
    }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async incrementAttempts(userId: string, changeId: string) {
    const db = this.database.getDb();
    const changeRequest = await db.select().from(subscriptionChangeRequests).where(eq(subscriptionChangeRequests.id, changeId)).limit(1).then(r => r[0] || null);
    if (!changeRequest) {
      throw new BadRequestException('Change request not found');
    }

    await db.update(subscriptionChangeRequests).set({
      attempts: (changeRequest.attempts || 0) + 1,
      updatedAt: new Date(),
    }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async setApplied(userId: string, changeId: string) {
    const db = this.database.getDb();
    await db.update(subscriptionChangeRequests).set({
      status: SubscriptionChangeStatus.APPLIED,
      updatedAt: new Date(),
    }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async setCanceled(userId: string, changeId: string) {
    const db = this.database.getDb();
    await db.update(subscriptionChangeRequests).set({
      status: SubscriptionChangeStatus.CANCELED,
      updatedAt: new Date(),
    }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async deleteScheduledChange(changeId: string, userId: string): Promise<number> {
    const db = this.database.getDb();
    const result = await db.delete(subscriptionChangeRequests).where(and(
      eq(subscriptionChangeRequests.id, changeId),
      eq(subscriptionChangeRequests.userId, userId)
    )).returning();
    return result.length;
  }

  private resolvePlanValueForCycle(plan: { priceCents: number; priceUsdCents: number }, cycle: BillingCycle): number {
    if (cycle === BillingCycle.YEARLY) {
      const annualPrice = (plan.priceCents * 12 * 0.8) / 100;
      return annualPrice;
    }
    return plan.priceCents / 100;
  }

  /**
   * Sync pending payments after upgrade
   */
  async syncPendingRecurringPaymentsAfterUpgrade(
    sub: { id: string; userId: string; gatewaySubscriptionId: string; gatewayName: string },
    newRecurringValue: number
  ) {
    const gateway = sub.gatewayName === GatewayNameEnum.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    const normalizedRecurringValue = newRecurringValue / 100; // Converte de cents para decimal

    let gatewayPayments: Awaited<ReturnType<typeof gateway.getSubscriptionPayments>> = [];

    try {
      gatewayPayments = await gateway.getSubscriptionPayments(sub.gatewaySubscriptionId);
    } catch (err: any) {
      this.logger.error(`Failed to get payments for subscription ${sub.id}: ${err.message}`);
      return;
    }

    for (const payment of gatewayPayments ?? []) {
      if (!payment?.id) continue;

      const normalizedStatus = gateway === this.asaasPaymentGateway
        ? this.asaasGatewayStatusMapper.normalizePaymentStatus(payment.status, null)
        : this.stripeGatewayStatusMapper.normalizePaymentStatus(payment.status, null);

      if (normalizedStatus !== PaymentStatus.PENDING && normalizedStatus !== PaymentStatus.OVERDUE) continue;

      const dueDate = payment.dueDate ? new Date(payment.dueDate) : null;
      if (!dueDate) continue;

      let syncedPayment = payment;
      try {
        syncedPayment = await gateway.updatePayment(payment.id, {
          value: normalizedRecurringValue,
          dueDate: dueDate.toISOString().split('T')[0],
        });
      } catch (err: any) {
        this.logger.error(
          `Failed to update open payment ${payment.id} after subscription change ${sub.id}: ${err.message}`
        );
        continue;
      }

      const syncedDueDate = syncedPayment.dueDate ? new Date(syncedPayment.dueDate) : dueDate;
      const syncedPaidAt = syncedPayment.paidAt ? new Date(syncedPayment.paidAt) : null;
      const syncedStatus = gateway === this.asaasPaymentGateway
        ? this.asaasGatewayStatusMapper.normalizePaymentStatus(syncedPayment.status, null) ?? normalizedStatus ?? PaymentStatus.PENDING
        : this.stripeGatewayStatusMapper.normalizePaymentStatus(syncedPayment.status, null) ?? normalizedStatus ?? PaymentStatus.PENDING;

      const billingType = syncedPayment.billingType ?? payment.billingType;
      const normalizedBillingType = billingType === BillingTypeEnum.BOLETO ? 'boleto' : billingType === BillingTypeEnum.PIX ? 'pix' : 'credit_card';

      await this.billingPaymentRepository.upsertSubscriptionPayment({
        subscriptionId: sub.id,
        userId: sub.userId,
        gateway: gateway === this.asaasPaymentGateway ? 'asaas' : 'stripe',
        gatewayPaymentId: payment.id,
        status: syncedStatus,
        billingType: normalizedBillingType,
        gatewayStatus: syncedPayment.status ?? payment.status ?? undefined,
        value: (syncedPayment.value ?? normalizedRecurringValue) * 100, // Converte de decimal para cents
        dueDate: syncedDueDate,
        paidAt: syncedPaidAt ?? null,
        invoiceUrl: syncedPayment.invoiceUrl ?? null,
        bankSlipUrl: syncedPayment.bankSlipUrl ?? null,
        pixQrCode: syncedPayment.pixQrCode ?? null,
        pixQrCodeUrl: syncedPayment.pixQrCodeUrl ?? null,
        description: syncedPayment.description ?? null,
        kind: 'recurring',
      });

      this.logger.info(
        `Recurring payment ${payment.id} synced after subscription change ${sub.id}`
      );
    }
  }
}

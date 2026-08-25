import { Injectable, BadRequestException } from '@nestjs/common';
import { SubscriptionChangeStatus, SubscriptionChangeType, SubscriptionStatus, BillingCycle, BillingType, PaymentStatus } from '../../../domain/enums/billing.enums.js';
import { SubscriptionPlan } from '../../../domain/enums/plans.enums.js';
import { PAYMENT_GATEWAY } from '../../../domain/constants/billing.constants.js';
import { resolvePlanValueForCycle } from '../../../domain/utils/plan-pricing.utils.js';
import { BillingTypeEnum, GatewayNameEnum } from '../../../infrastructure/billing/gateways/IPaymentGateway.js';
import { toGatewayBillingType } from '../../../infrastructure/billing/helpers/billingTypeMapper.js';
import { AsaasPaymentGateway } from '../../../infrastructure/billing/gateways/asaas/AsaasPaymentGateway.js';
import { StripePaymentGateway } from '../../../infrastructure/billing/gateways/stripe/StripePaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../../../infrastructure/billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { StripeGatewayStatusMapper } from '../../../infrastructure/billing/gateways/stripe/StripeGatewayStatusMapper.js';
import { BillingPaymentRepository, SubscriptionRepository } from '../../ports/billing/billing-repositories.js';
import { AppLogger } from '../../../observability/logger.js';
import { SubscriptionCancellationService } from './SubscriptionCancellationService.js';
import crypto from 'node:crypto';

@Injectable()
export class SubscriptionChangeService {
  constructor(
    private readonly asaasPaymentGateway: AsaasPaymentGateway,
    private readonly stripePaymentGateway: StripePaymentGateway,
    private readonly asaasGatewayStatusMapper: AsaasGatewayStatusMapper,
    private readonly stripeGatewayStatusMapper: StripeGatewayStatusMapper,
    private readonly billingPaymentRepository: BillingPaymentRepository,
    private readonly subscriptionRepository: SubscriptionRepository,
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
    const existingChange = await this.subscriptionRepository.getScheduledChangeRequest(params.userId, params.type);

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

    const inserted = await this.subscriptionRepository.createSubscriptionChangeRequest(changeRequest);
    return inserted.id;
  }

  async cancelScheduledChange(userId: string, changeId: string) {
    await this.subscriptionRepository.updateSubscriptionChangeRequestStatus(changeId, SubscriptionChangeStatus.CANCELED, { canceledAt: new Date() });
  }

  async getScheduledChange(userId: string) {
    return this.subscriptionRepository.getScheduledChangeRequest(userId, SubscriptionChangeType.DOWNGRADE);
  }

  async isChangeScheduled(userId: string, type?: SubscriptionChangeType): Promise<boolean> {
    const change = await this.subscriptionRepository.getScheduledChangeRequest(userId, type || SubscriptionChangeType.DOWNGRADE);
    return Boolean(change);
  }

  async applyScheduledChange(changeId: string) {
    const changeRequest = await this.subscriptionRepository.getScheduledChangeRequest(changeId, SubscriptionChangeType.DOWNGRADE);
    if (!changeRequest) {
      throw new BadRequestException('Change request not found');
    }

    if (changeRequest.status !== SubscriptionChangeStatus.SCHEDULED) {
      throw new BadRequestException('Change request is not scheduled');
    }

    const sub = await this.subscriptionRepository.getSubscriptionByUserId(changeRequest.userId);
    if (!sub) {
      throw new BadRequestException('Subscription not found');
    }

    // Check if downgrade to free plan - cancel subscription
    const plan = await this.subscriptionRepository.getPlanById(changeRequest.toPlanId);
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    if (plan.slug === SubscriptionPlan.FREE) {
      // If downgrade to free plan, cancel subscription in gateway
      await this.subscriptionCancellationService.cancelSubscription(changeRequest.userId);
      await this.subscriptionRepository.updateSubscriptionChangeRequestStatus(changeId, SubscriptionChangeStatus.APPLIED, { appliedAt: new Date() });
      return;
    }

    // Update subscription in gateway
    const gateway = changeRequest.fromGateway === 'stripe' ? this.stripePaymentGateway : this.asaasPaymentGateway;
    const billingCycle = (changeRequest.toBillingCycle as string) === 'yearly' ? BillingCycle.YEARLY : BillingCycle.MONTHLY;
    const gatewayEnum = changeRequest.fromGateway === PAYMENT_GATEWAY.STRIPE
      ? GatewayNameEnum.STRIPE
      : GatewayNameEnum.ASAAS;
    const targetRecurringValue = resolvePlanValueForCycle(plan, billingCycle, gatewayEnum);
    
    if (!sub.gatewaySubscriptionId) {
      this.logger.warn(`Subscription ${sub.userId} does not have gatewaySubscriptionId, skipping gateway update`);
    } else {
      try {
        await gateway.updateSubscription(sub.gatewaySubscriptionId, {
          value: targetRecurringValue,
          cycle: billingCycle === BillingCycle.YEARLY ? BillingCycle.YEARLY : BillingCycle.MONTHLY,
          billingType: toGatewayBillingType(changeRequest.toBillingType as BillingType) ?? BillingTypeEnum.CREDIT_CARD,
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
    await this.subscriptionRepository.upsertUserSubscription(changeRequest.userId, {
      planId: changeRequest.toPlanId,
      billingCycle: changeRequest.toBillingCycle as any,
      billingType: changeRequest.toBillingType as any,
    });

    await this.subscriptionRepository.updateSubscriptionChangeRequestStatus(changeId, SubscriptionChangeStatus.APPLIED, { appliedAt: new Date() });
  }

  async incrementAttempts(userId: string, changeId: string) {
    const changeRequest = await this.subscriptionRepository.getScheduledChangeRequest(changeId, SubscriptionChangeType.DOWNGRADE);
    if (!changeRequest) {
      throw new BadRequestException('Change request not found');
    }
  }

  async setApplied(userId: string, changeId: string) {
    await this.subscriptionRepository.updateSubscriptionChangeRequestStatus(changeId, SubscriptionChangeStatus.APPLIED, { appliedAt: new Date() });
  }

  async setCanceled(userId: string, changeId: string) {
    await this.subscriptionRepository.updateSubscriptionChangeRequestStatus(changeId, SubscriptionChangeStatus.CANCELED, { canceledAt: new Date() });
  }

  async deleteScheduledChange(changeId: string, userId: string): Promise<number> {
    await this.subscriptionRepository.updateSubscriptionChangeRequestStatus(changeId, SubscriptionChangeStatus.CANCELED, { canceledAt: new Date() });
    return 1;
  }

  /**
   * Sync pending payments after upgrade
   */
  async syncPendingRecurringPaymentsAfterUpgrade(
    sub: { id: string; userId: string; gatewaySubscriptionId: string; gatewayName: string },
    newRecurringValue: number
  ) {
    const gateway = sub.gatewayName === GatewayNameEnum.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    const normalizedRecurringValue = newRecurringValue;

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

      const billingType = syncedPayment.billingType ?? payment.billingType ?? null;

      await this.billingPaymentRepository.upsertSubscriptionPayment({
        subscriptionId: sub.id,
        userId: sub.userId,
        gateway: gateway === this.asaasPaymentGateway ? 'asaas' : 'stripe',
        gatewayPaymentId: payment.id,
        status: syncedStatus,
        billingType: billingType,
        gatewayStatus: syncedPayment.status ?? payment.status ?? undefined,
        value: syncedPayment.value ?? normalizedRecurringValue,
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

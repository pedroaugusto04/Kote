import { SubscriptionPlan } from '../../domain/enums/plans.enums.js';
import { BillingType, BillingCycle } from '../../domain/enums/billing.enums.js';
import { BillingTypeEnum } from '../ports/billing/payment-gateway.port.js';
import { PAYMENT_GATEWAY } from '../../domain/constants/billing.constants.js';
import { canCancelPayment } from '../../domain/utils/payment.utils.js';
import type {
  PlanRecord,
  BillingPaymentRecord,
  UserSubscriptionRecord,
  SubscriptionChangeRequestRecord,
} from '../models/billing.models.js';
import type { PlanDto, PendingPaymentSummaryDto } from '../dto/billing.dto.js';

/**
 * Maps domain BillingType enum to gateway BillingTypeEnum
 */
export function toGatewayBillingType(billingType: BillingType): BillingTypeEnum {
  switch (billingType) {
    case BillingType.CREDIT_CARD:
      return BillingTypeEnum.CREDIT_CARD;
    case BillingType.PIX:
      return BillingTypeEnum.PIX;
    case BillingType.BOLETO:
      return BillingTypeEnum.BOLETO;
    default:
      return BillingTypeEnum.CREDIT_CARD;
  }
}

export class SubscriptionPlanMapper {
  static toPlanDto(plan: PlanRecord): PlanDto {
    return {
      id: plan.id,
      name: plan.displayName,
      description: plan.description,
      price: plan.priceCents / 100,
      annualPrice: (plan.priceCents * 12 * 0.8) / 100,
      priceUsd: plan.priceUsdCents / 100,
      annualPriceUsd: (plan.priceUsdCents * 12 * 0.8) / 100,
      maxStorageBytes: Number(plan.maxStorageBytes),
      maxAiCreditsPerMonth: plan.maxAiCreditsPerMonth,
      maxWorkspaces: plan.maxWorkspaces,
      maxProjectsPerWorkspace: plan.maxProjectsPerWorkspace,
      isDefault: plan.slug === SubscriptionPlan.FREE,
      isVisible: plan.isActive,
    };
  }

  static toSubscriptionContextPlan(plan: PlanRecord | null | undefined) {
    if (!plan) return undefined;
    return {
      id: plan.id,
      slug: plan.slug,
      displayName: plan.displayName,
      priceCents: plan.priceCents,
      priceUsdCents: plan.priceUsdCents,
      maxStorageBytes: Number(plan.maxStorageBytes),
      maxAiCreditsPerMonth: plan.maxAiCreditsPerMonth,
      maxWorkspaces: plan.maxWorkspaces,
      maxProjectsPerWorkspace: plan.maxProjectsPerWorkspace,
      isActive: plan.isActive,
    };
  }
}

export class UserSubscriptionMapper {
  static toSubscriptionSummary(subRow: UserSubscriptionRecord | null) {
    if (!subRow) return null;
    return {
      userId: subRow.userId,
      planId: subRow.planId,
      status: subRow.status,
      currentPeriodStart: subRow.currentPeriodStart.toISOString(),
      currentPeriodEnd: subRow.currentPeriodEnd.toISOString(),
      billingCycle: subRow.billingCycle,
      billingType: subRow.billingType,
      nextDueDate: subRow.nextDueDate ? subRow.nextDueDate.toISOString() : null,
      gatewayName: subRow.gatewayName,
    };
  }

  static toSubscriptionContextActiveSub(
    activeSubRow: UserSubscriptionRecord | null | undefined,
    fallbackGatewayName: string,
  ) {
    if (!activeSubRow) return undefined;
    return {
      id: activeSubRow.userId,
      planId: activeSubRow.planId,
      billingCycle: activeSubRow.billingCycle === 'monthly' ? BillingCycle.MONTHLY : BillingCycle.YEARLY,
      gatewaySubscriptionId: activeSubRow.gatewaySubscriptionId || '',
      nextDueDate: activeSubRow.nextDueDate || undefined,
      gatewayName: activeSubRow.gatewayName || fallbackGatewayName,
    };
  }
}

export class SubscriptionChangeMapper {
  static toScheduledChangeDto(
    scheduledChange: SubscriptionChangeRequestRecord | null | undefined,
    targetPlan: PlanRecord | null | undefined,
  ) {
    if (!scheduledChange) return null;
    return {
      id: scheduledChange.id,
      userId: scheduledChange.userId,
      fromSubscriptionId: scheduledChange.fromSubscriptionId ?? undefined,
      toPlanId: scheduledChange.toPlanId,
      toPlan: targetPlan ? SubscriptionPlanMapper.toPlanDto(targetPlan) : null,
      toBillingCycle: scheduledChange.toBillingCycle,
      toBillingType: scheduledChange.toBillingType,
      type: scheduledChange.type,
      status: scheduledChange.status,
      effectiveAt: scheduledChange.effectiveAt.toISOString(),
    };
  }
}

export class BillingPaymentMapper {
  static toPendingPaymentSummary(paymentRow: BillingPaymentRecord | null): PendingPaymentSummaryDto | null {
    if (!paymentRow) return null;

    return {
      id: paymentRow.id,
      subscriptionId: paymentRow.subscriptionId,
      userId: paymentRow.userId,
      gateway: paymentRow.gateway,
      gatewayPaymentId: paymentRow.gatewayPaymentId,
      status: paymentRow.status,
      billingType: paymentRow.billingType,
      kind: paymentKindMapper(paymentRow.kind),
      value: Number(paymentRow.value),
      dueDate: paymentRow.dueDate.toISOString(),
      bankSlipUrl: paymentRow.bankSlipUrl,
      pixQrCode: paymentRow.pixQrCode,
      pixQrCodeUrl: paymentRow.pixQrCodeUrl,
      invoiceUrl: paymentRow.invoiceUrl,
      stripeClientSecret: paymentRow.gateway === PAYMENT_GATEWAY.STRIPE ? paymentRow.stripeClientSecret ?? null : null,
      canCancel: canCancelPayment(paymentRow),
    };
  }
}

function paymentKindMapper(kind: string): string {
  return kind;
}

import { SubscriptionPlan } from '../../domain/enums/plans.enums.js';
import { PAYMENT_GATEWAY } from '../../domain/constants/billing.constants.js';
import { canCancelPayment } from '../../infrastructure/utils/billing/paymentUtils.js';
import type { PlanRecord, BillingPaymentRecord } from '../models/billing.models.js';
import type { PlanDto, PendingPaymentSummaryDto } from '../dto/billing.dto.js';

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
      kind: paymentRow.kind,
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

import { SubscriptionPlan } from '../../domain/enums/plans.enums.js';
import { BillingType } from '../../domain/enums/billing.enums.js';
import { BillingTypeEnum } from '../ports/billing/payment-gateway.port.js';
import { PAYMENT_GATEWAY } from '../../domain/constants/billing.constants.js';
import { canCancelPayment } from '../../domain/utils/payment.utils.js';
import type { PlanRecord, BillingPaymentRecord } from '../models/billing.models.js';
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

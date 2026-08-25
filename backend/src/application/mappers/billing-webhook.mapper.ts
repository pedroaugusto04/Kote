import { BillingIntentType } from '../../domain/enums/billing.enums.js';
import type { PaymentGateway, PaymentStatus, PaymentKind } from '../models/billing.models.js';

export interface BuildPaymentDataInput {
  subscriptionId: string | null;
  userId: string;
  gateway: PaymentGateway;
  gatewayPaymentId: string;
  payStatus: PaymentStatus;
  payment: any;
  existingPayment?: any;
  intent?: any;
  value: number;
  dueDate: Date | null;
  paidAt: Date | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  pixQrCode: string | null;
  pixQrCodeUrl: string | null;
  eventCreatedAt: Date | null;
}

export class BillingWebhookMapper {
  static toPaymentData(input: BuildPaymentDataInput) {
    const {
      subscriptionId,
      userId,
      gateway,
      gatewayPaymentId,
      payStatus,
      payment,
      existingPayment,
      intent,
      value,
      dueDate,
      paidAt,
      invoiceUrl,
      bankSlipUrl,
      pixQrCode,
      pixQrCodeUrl,
      eventCreatedAt,
    } = input;

    const kind: PaymentKind = existingPayment?.kind || (
      (intent?.type === BillingIntentType.NEW || intent?.type === BillingIntentType.UPGRADE)
        ? 'upgrade'
        : 'recurring'
    );

    return {
      subscriptionId,
      userId,
      gateway,
      gatewayPaymentId,
      status: payStatus,
      billingType: payment.billingType ?? existingPayment?.billingType ?? null,
      kind,
      gatewayStatus: payment.status || null,
      value,
      dueDate: dueDate || new Date(),
      paidAt,
      invoiceUrl,
      bankSlipUrl,
      pixQrCode,
      pixQrCodeUrl,
      description: payment.description || existingPayment?.description || null,
      stripeClientSecret: payment.stripeClientSecret ?? existingPayment?.stripeClientSecret ?? null,
      lastGatewayEventAt: eventCreatedAt,
    };
  }
}

import {
  BillingTypeEnum,
  type GatewayPayment,
  type CreatePaymentInput,
  type UpdatePaymentInput,
} from '../IPaymentGateway.js';

export class StripePaymentMapper {
  static toGatewayPaymentFromInvoice(data: any): GatewayPayment {
    const paid = data.status === 'paid' || data.paid === true;
    const amount = paid ? (data.amount_paid ?? data.total ?? 0) : (data.amount_due ?? data.total ?? 0);

    return {
      id: data.id,
      status: paid ? 'confirmed' : data.status || 'pending',
      value: amount / 100,
      dueDate: data.due_date ? new Date(data.due_date * 1000) : new Date(),
      billingType: BillingTypeEnum.CREDIT_CARD,
      paidAt: data.status_transitions?.paid_at
        ? new Date(data.status_transitions.paid_at * 1000)
        : undefined,
      invoiceUrl: data.hosted_invoice_url || undefined,
      subscription: data.subscription || undefined,
      description: data.description || data.metadata?.description || undefined,
      externalReference: data.metadata?.externalReference || undefined,
      creditCardToken: data.default_payment_method || data.payment_intent?.payment_method || undefined,
      customerId: typeof data.customer === 'string' ? data.customer : data.customer?.id || undefined,
    };
  }

  static toGatewayPaymentFromIntent(data: any, input?: Partial<CreatePaymentInput | UpdatePaymentInput>): GatewayPayment {
    const succeeded = data.status === 'succeeded';

    return {
      id: data.id,
      status: succeeded ? 'confirmed' : data.status || 'pending',
      value: (data.amount ?? 0) / 100,
      dueDate: input?.dueDate ? new Date(input.dueDate) : new Date(),
      billingType: BillingTypeEnum.CREDIT_CARD,
      paidAt: succeeded ? new Date() : undefined,
      description: data.metadata?.description || data.description || input?.description || undefined,
      externalReference: data.metadata?.externalReference || input?.externalReference || undefined,
      subscription: data.metadata?.subscriptionId || data.metadata?.subscription || undefined,
      stripeClientSecret: data.client_secret || undefined,
      creditCardToken: typeof data.payment_method === 'string'
        ? data.payment_method
        : data.payment_method?.id || undefined,
      customerId: typeof data.customer === 'string' ? data.customer : data.customer?.id || (input as any)?.customerId || undefined,
    };
  }
}

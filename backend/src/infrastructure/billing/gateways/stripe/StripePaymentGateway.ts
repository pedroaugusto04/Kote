import { Injectable, Logger } from '@nestjs/common';
import {
  CreateCustomerInput,
  CreatePaymentInput,
  CreateSubscriptionInput,
  GatewayNameEnum,
  GatewayCustomer,
  GatewayPayment,
  GatewaySubscription,
  GatewayWebhookEvent,
  IPaymentGateway,
  UpdateSubscriptionInput,
  UpdatePaymentInput,
  BillingTypeEnum,
} from '../IPaymentGateway.js';

function serializeToForm(obj: any, prefix?: string): string {
  const str: string[] = [];
  for (const p in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, p)) {
      const k = prefix ? `${prefix}[${p}]` : p;
      const v = obj[p];
      if (v !== null && typeof v === 'object') {
        str.push(serializeToForm(v, k));
      } else if (v !== undefined) {
        str.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
      }
    }
  }
  return str.filter(Boolean).join('&');
}

@Injectable()
export class StripePaymentGateway implements IPaymentGateway {
  readonly gateway = GatewayNameEnum.STRIPE as any; // Cast in case GatewayNameEnum needs to be updated
  private readonly logger = new Logger(StripePaymentGateway.name);

  private ensureConfigured() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    this.ensureConfigured();
    const url = `https://api.stripe.com/v1${path}`;
    const headers = {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const text = await response.text();
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!response.ok) {
        throw new Error(data?.error?.message || `Stripe error: ${response.statusText}`);
      }

      return data as T;
    } catch (err: any) {
      this.logger.error(`Stripe API error on ${path}: ${err.message}`);
      throw err;
    }
  }

  async createCustomer(input: CreateCustomerInput): Promise<GatewayCustomer> {
    const body = {
      name: input.name,
      email: input.email || '',
      metadata: {
        cpfCnpj: input.cpfCnpj || '',
        externalReference: input.externalReference || '',
      },
    };

    const data = await this.request<any>('/customers', {
      method: 'POST',
      body: serializeToForm(body),
    });

    if (!data?.id) {
      throw new Error('Stripe did not return customer id');
    }

    return { id: data.id };
  }

  async findCustomerByCpfCnpj(cpfCnpj: string): Promise<GatewayCustomer | null> {
    // Stripe does not naturally search by CPF/CNPJ, but we can search customers list or metadata.
    // However, since Stripe is for non-BR, they don't have CPF/CNPJ. We can return null.
    return null;
  }

  private async getOrCreateProductAndPrice(name: string, value: number, cycle: string): Promise<string> {
    // 1. Check if product exists or create it
    const productId = `prod_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    let product: any;
    try {
      product = await this.request<any>(`/products/${productId}`);
    } catch {
      product = await this.request<any>('/products', {
        method: 'POST',
        body: serializeToForm({
          id: productId,
          name,
        }),
      });
    }

    // 2. Find or create a price for this value, currency (usd) and interval
    const centsValue = Math.round(value * 100);
    const pricesData = await this.request<{ data: any[] }>(
      `/prices?product=${productId}&active=true`
    );
    
    const existingPrice = pricesData.data.find(
      (p: any) =>
        p.unit_amount === centsValue &&
        p.currency === 'usd' &&
        p.recurring?.interval === (cycle === 'YEARLY' ? 'year' : 'month')
    );

    if (existingPrice) {
      return existingPrice.id;
    }

    const price = await this.request<any>('/prices', {
      method: 'POST',
      body: serializeToForm({
        product: productId,
        unit_amount: centsValue,
        currency: 'usd',
        recurring: {
          interval: cycle === 'YEARLY' ? 'year' : 'month',
        },
      }),
    });

    return price.id;
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<GatewaySubscription> {
    // Get product name from description or default
    const planName = input.description?.split(' ')[1] || 'Pro';
    const priceId = await this.getOrCreateProductAndPrice(
      planName,
      input.value,
      input.cycle
    );

    // Create subscription
    const body: any = {
      customer: input.customerId,
      items: [{ price: priceId }],
      metadata: {
        externalReference: input.externalReference || '',
      },
    };

    if (input.creditCardToken) {
      // Attach payment method if provided
      // In Stripe, creditCardToken represents the PaymentMethod ID (e.g. pm_...)
      try {
        await this.request<any>(`/payment_methods/${input.creditCardToken}/attach`, {
          method: 'POST',
          body: serializeToForm({ customer: input.customerId }),
        });
        
        // Set as default payment method on customer
        await this.request<any>(`/customers/${input.customerId}`, {
          method: 'POST',
          body: serializeToForm({
            invoice_settings: {
              default_payment_method: input.creditCardToken,
            },
          }),
        });
      } catch (e: any) {
        this.logger.warn(`Failed to attach payment method to customer: ${e.message}`);
      }
    }

    const data = await this.request<any>('/subscriptions', {
      method: 'POST',
      body: serializeToForm(body),
    });

    if (!data?.id) {
      throw new Error('Stripe did not return subscription id');
    }

    return {
      id: data.id,
      status: data.status,
      nextDueDate: data.current_period_end
        ? new Date(data.current_period_end * 1000)
        : undefined,
    };
  }

  async updateSubscription(
    gatewaySubscriptionId: string,
    input: UpdateSubscriptionInput
  ): Promise<GatewaySubscription> {
    const sub = await this.getSubscriptionByGatewayId(gatewaySubscriptionId);
    if (!sub) {
      throw new Error(`Stripe subscription ${gatewaySubscriptionId} not found`);
    }

    // If updating plan value or cycle, we need to find or create the new price
    let priceId: string | undefined;
    if (input.value !== undefined) {
      // Get current subscription to fetch product name
      const stripeSub = await this.request<any>(`/subscriptions/${gatewaySubscriptionId}`);
      const productId = stripeSub?.items?.data?.[0]?.price?.product;
      let planName = 'Pro';
      if (productId) {
        try {
          const prod = await this.request<any>(`/products/${productId}`);
          planName = prod.name;
        } catch {
          // ignore
        }
      }

      priceId = await this.getOrCreateProductAndPrice(
        planName,
        input.value,
        input.cycle || 'MONTHLY'
      );
    }

    const stripeSub = await this.request<any>(`/subscriptions/${gatewaySubscriptionId}`);
    const itemId = stripeSub?.items?.data?.[0]?.id;

    const body: any = {};
    if (priceId && itemId) {
      body.items = [{
        id: itemId,
        price: priceId,
      }];
    }

    if (input.externalReference) {
      body.metadata = {
        externalReference: input.externalReference,
      };
    }

    const data = await this.request<any>(`/subscriptions/${gatewaySubscriptionId}`, {
      method: 'POST',
      body: serializeToForm(body),
    });

    return {
      id: data.id,
      status: data.status,
      nextDueDate: data.current_period_end
        ? new Date(data.current_period_end * 1000)
        : undefined,
    };
  }

  async cancelSubscription(gatewaySubscriptionId: string): Promise<void> {
    await this.request<void>(`/subscriptions/${gatewaySubscriptionId}`, {
      method: 'DELETE',
    });
  }

  async cancelPayment(gatewayPaymentId: string): Promise<void> {
    // In Stripe, this usually cancels a PaymentIntent
    await this.request<void>(`/payment_intents/${gatewayPaymentId}/cancel`, {
      method: 'POST',
    });
  }

  async createPayment(input: CreatePaymentInput): Promise<GatewayPayment> {
    const centsValue = Math.round(input.value * 100);
    const body: any = {
      amount: centsValue,
      currency: 'usd',
      customer: input.customerId,
      metadata: {
        externalReference: input.externalReference || '',
        userId: input.userId,
      },
    };

    if (input.creditCardToken) {
      body.payment_method = input.creditCardToken;
      body.confirm = true;
      body.off_session = true;
    }

    const data = await this.request<any>('/payment_intents', {
      method: 'POST',
      body: serializeToForm(body),
    });

    return {
      id: data.id,
      status: data.status === 'succeeded' ? 'confirmed' : 'pending',
      value: data.amount / 100,
      dueDate: new Date(),
      billingType: BillingTypeEnum.CREDIT_CARD,
      paidAt: data.status === 'succeeded' ? new Date() : undefined,
    };
  }

  async updatePayment(gatewayPaymentId: string, input: UpdatePaymentInput): Promise<GatewayPayment> {
    const centsValue = input.value !== undefined ? Math.round(input.value * 100) : undefined;
    const body: any = {};
    if (centsValue !== undefined) {
      body.amount = centsValue;
    }
    if (input.description) {
      body.description = input.description;
    }
    if (input.externalReference) {
      body.metadata = {
        externalReference: input.externalReference,
      };
    }

    const data = await this.request<any>(`/payment_intents/${gatewayPaymentId}`, {
      method: 'POST',
      body: serializeToForm(body),
    });

    return {
      id: data.id,
      status: data.status === 'succeeded' ? 'confirmed' : 'pending',
      value: data.amount / 100,
      dueDate: new Date(),
      billingType: BillingTypeEnum.CREDIT_CARD,
    };
  }

  async getSubscriptionPayments(gatewaySubscriptionId: string): Promise<GatewayPayment[]> {
    // List invoices for this subscription
    const invoicesData = await this.request<{ data: any[] }>(
      `/invoices?subscription=${gatewaySubscriptionId}`
    );

    return invoicesData.data.map((inv: any) => ({
      id: inv.id,
      status: inv.paid ? 'confirmed' : 'pending',
      value: inv.amount_due / 100,
      dueDate: inv.due_date ? new Date(inv.due_date * 1000) : new Date(),
      billingType: BillingTypeEnum.CREDIT_CARD,
      paidAt: inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : undefined,
      invoiceUrl: inv.hosted_invoice_url || undefined,
    }));
  }

  async getSubscriptionByGatewayId(gatewaySubscriptionId: string): Promise<GatewaySubscription | null> {
    try {
      const data = await this.request<any>(`/subscriptions/${gatewaySubscriptionId}`);
      if (!data?.id) return null;
      return {
        id: data.id,
        status: data.status,
        nextDueDate: data.current_period_end
          ? new Date(data.current_period_end * 1000)
          : undefined,
      };
    } catch {
      return null;
    }
  }

  parseWebhook(body: Record<string, unknown>): GatewayWebhookEvent {
    // Simple mock / parse implementation for Stripe webhooks
    const event = String(body.type || '');
    const dataObject = (body.data as any)?.object || {};
    
    let payment: GatewayPayment | undefined;
    let subscription: GatewaySubscription | undefined;

    if (event.startsWith('invoice.')) {
      payment = {
        id: dataObject.id,
        status: dataObject.paid ? 'confirmed' : 'pending',
        value: (dataObject.amount_due || 0) / 100,
        dueDate: dataObject.due_date ? new Date(dataObject.due_date * 1000) : new Date(),
        paidAt: dataObject.status_transitions?.paid_at ? new Date(dataObject.status_transitions.paid_at * 1000) : undefined,
        subscription: dataObject.subscription || undefined,
      };
    } else if (event.startsWith('customer.subscription.')) {
      subscription = {
        id: dataObject.id,
        status: dataObject.status,
        nextDueDate: dataObject.current_period_end ? new Date(dataObject.current_period_end * 1000) : undefined,
      };
    }

    return {
      event,
      eventCreatedAt: new Date(),
      payment,
      subscription,
      raw: body,
    };
  }

  async getPaymentByGatewayId(gatewayPaymentId: string): Promise<GatewayPayment | null> {
    try {
      const data = await this.request<any>(`/payment_intents/${gatewayPaymentId}`);
      if (!data?.id) return null;
      return {
        id: data.id,
        status: data.status === 'succeeded' ? 'confirmed' : 'pending',
        value: data.amount / 100,
        dueDate: new Date(),
        billingType: BillingTypeEnum.CREDIT_CARD,
      };
    } catch {
      return null;
    }
  }
}

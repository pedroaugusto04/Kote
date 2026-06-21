import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
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

function stripeToAppError(err: any): HttpException {
  if (err instanceof HttpException) return err;

  const gatewayError = err || {};
  const code = gatewayError.code;

  if (code === 'ECONNABORTED') {
    return new HttpException({ code: 'payment_gateway_timeout' }, HttpStatus.GATEWAY_TIMEOUT);
  }

  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT') {
    return new HttpException({ code: 'payment_gateway_unavailable' }, HttpStatus.BAD_GATEWAY);
  }

  const message = gatewayError.message || 'Stripe error';
  const stripeErrorMessage = message.includes('Stripe error') ? message : `Stripe error: ${message}`;

  return new HttpException({ code: 'stripe_payment_failed', details: { originalMessage: stripeErrorMessage } }, HttpStatus.BAD_REQUEST);
}

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
  readonly gateway = GatewayNameEnum.STRIPE as any;
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
        throw stripeToAppError({ message: data?.error?.message || `Stripe error: ${response.statusText}` });
      }

      return data as T;
    } catch (err: any) {
      this.logger.error(`Stripe API error on ${path}: ${err.message}`);
      throw stripeToAppError(err);
    }
  }

  private async attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    await this.request<any>(`/payment_methods/${paymentMethodId}/attach`, {
      method: 'POST',
      body: serializeToForm({ customer: customerId }),
    });

    await this.request<any>(`/customers/${customerId}`, {
      method: 'POST',
      body: serializeToForm({
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      }),
    });
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

  async findCustomerByCpfCnpj(_cpfCnpj: string): Promise<GatewayCustomer | null> {
    return null;
  }

  private async getOrCreateProductAndPrice(name: string, value: number, cycle: string): Promise<string> {
    const productId = `prod_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    try {
      await this.request<any>(`/products/${productId}`);
    } catch {
      await this.request<any>('/products', {
        method: 'POST',
        body: serializeToForm({
          id: productId,
          name,
        }),
      });
    }

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
    const planName = input.description?.split(' ')[1] || 'Pro';
    const priceId = await this.getOrCreateProductAndPrice(
      planName,
      input.value,
      input.cycle
    );

    const body: any = {
      customer: input.customerId,
      items: [{ price: priceId }],
      metadata: {
        externalReference: input.externalReference || '',
        userId: input.userId || '',
      },
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
    };

    if (input.creditCardToken) {
      try {
        await this.attachPaymentMethod(input.customerId, input.creditCardToken);
        body.default_payment_method = input.creditCardToken;
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

    let priceId: string | undefined;
    if (input.value !== undefined) {
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

    const body: any = {
      proration_behavior: 'create_prorations',
    };
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
    if (gatewayPaymentId.startsWith('in_')) {
      await this.request<void>(`/invoices/${gatewayPaymentId}/void`, {
        method: 'POST',
      });
      return;
    }

    if (gatewayPaymentId.startsWith('pi_')) {
      await this.request<void>(`/payment_intents/${gatewayPaymentId}/cancel`, {
        method: 'POST',
      });
      return;
    }

    throw new Error(`Unsupported Stripe payment id: ${gatewayPaymentId}`);
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
        subscriptionId: input.subscriptionId || '',
        description: input.description || '',
      },
    };

    if (input.creditCardToken) {
      await this.attachPaymentMethod(input.customerId, input.creditCardToken);
      body.payment_method = input.creditCardToken;
      body.confirm = true;
      body.off_session = false;
      body.setup_future_usage = 'off_session';
    } else {
      body.automatic_payment_methods = {
        enabled: true,
      };
    }

    const data = await this.request<any>('/payment_intents', {
      method: 'POST',
      body: serializeToForm(body),
    });

    return this.mapPaymentIntent(data, input);
  }

  async updatePayment(gatewayPaymentId: string, input: UpdatePaymentInput): Promise<GatewayPayment> {
    if (gatewayPaymentId.startsWith('in_')) {
      return this.getInvoiceAsPayment(gatewayPaymentId) as Promise<GatewayPayment>;
    }

    const centsValue = input.value !== undefined ? Math.round(input.value * 100) : undefined;
    const body: any = {};
    if (centsValue !== undefined) {
      body.amount = centsValue;
    }
    if (input.description) {
      body.metadata = {
        description: input.description,
      };
    }
    if (input.externalReference) {
      body.metadata = {
        ...body.metadata,
        externalReference: input.externalReference,
      };
    }

    const data = await this.request<any>(`/payment_intents/${gatewayPaymentId}`, {
      method: 'POST',
      body: serializeToForm(body),
    });

    return this.mapPaymentIntent(data, input);
  }

  async getSubscriptionPayments(gatewaySubscriptionId: string): Promise<GatewayPayment[]> {
    const invoicesData = await this.request<{ data: any[] }>(
      `/invoices?subscription=${gatewaySubscriptionId}`
    );

    return invoicesData.data.map((inv: any) => this.mapInvoice(inv));
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
    const event = String(body.type || '');
    const dataObject = (body.data as any)?.object || {};

    let payment: GatewayPayment | undefined;
    let subscription: GatewaySubscription | undefined;

    if (event.startsWith('invoice.')) {
      payment = this.mapInvoice(dataObject);
    } else if (event.startsWith('payment_intent.')) {
      payment = this.mapPaymentIntent(dataObject);
    } else if (event.startsWith('customer.subscription.')) {
      subscription = {
        id: dataObject.id,
        status: dataObject.status,
        nextDueDate: dataObject.current_period_end ? new Date(dataObject.current_period_end * 1000) : undefined,
      };
    }

    return {
      event,
      eventCreatedAt: body.created ? new Date((body.created as number) * 1000) : new Date(),
      payment,
      subscription,
      raw: body,
    };
  }

  async getPaymentByGatewayId(gatewayPaymentId: string): Promise<GatewayPayment | null> {
    try {
      if (gatewayPaymentId.startsWith('in_')) {
        return this.getInvoiceAsPayment(gatewayPaymentId);
      }
      if (gatewayPaymentId.startsWith('pi_')) {
        return this.getPaymentIntentAsPayment(gatewayPaymentId);
      }
      return null;
    } catch {
      return null;
    }
  }

  private async getInvoiceAsPayment(gatewayPaymentId: string): Promise<GatewayPayment | null> {
    const data = await this.request<any>(`/invoices/${gatewayPaymentId}`);
    if (!data?.id) return null;
    return this.mapInvoice(data);
  }

  private async getPaymentIntentAsPayment(gatewayPaymentId: string): Promise<GatewayPayment | null> {
    const data = await this.request<any>(`/payment_intents/${gatewayPaymentId}`);
    if (!data?.id) return null;
    return this.mapPaymentIntent(data);
  }

  private mapInvoice(data: any): GatewayPayment {
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
    };
  }

  private mapPaymentIntent(data: any, input?: Partial<CreatePaymentInput | UpdatePaymentInput>): GatewayPayment {
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
    };
  }
}

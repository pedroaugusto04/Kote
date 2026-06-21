import { request } from './request';

export interface PlanDTO {
  id: string;
  name: string;
  description: string;
  price: number;
  annualPrice: number;
  maxStorageBytes: number;
  maxAiRequestsPerMonth: number;
  maxWorkspaces: number;
  maxProjectsPerWorkspace: number;
  isDefault: boolean;
  isVisible: boolean;
}

export interface SubscriptionDTO {
  userId: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  billingCycle: 'monthly' | 'yearly';
  billingType: 'credit_card' | 'pix' | 'boleto' | null;
  nextDueDate: string | null;
}

export interface PendingPaymentDTO {
  id: string;
  subscriptionId: string;
  userId: string;
  gateway: string;
  gatewayPaymentId: string;
  status: string;
  billingType: string;
  kind: string;
  value: number;
  dueDate: string;
  bankSlipUrl: string | null;
  pixQrCode: string | null;
  pixQrCodeUrl: string | null;
  invoiceUrl: string | null;
  canCancel: boolean;
}

export interface ScheduledChangeDTO {
  id: string;
  userId: string;
  fromSubscriptionId: string;
  toPlanId: string;
  toBillingCycle: 'monthly' | 'yearly';
  toBillingType: 'credit_card' | 'pix' | 'boleto';
  type: 'downgrade' | 'upgrade';
  status: string;
  effectiveAt: string;
}

export interface SubscriptionSummaryDTO {
  latestSub: SubscriptionDTO;
  activeSub: SubscriptionDTO | null;
  latestPendingPayment: PendingPaymentDTO | null;
  scheduledChange: ScheduledChangeDTO | null;
  entitledPlanId: string;
  entitledUntil: string | null;
  hasCreditCardOnFile: boolean;
}

export interface QuotaAndBillingStatusDTO {
  plan: string;
  status: string;
  currentPeriodEnd: string;
  limits: {
    storage: number;
    aiRequests: number;
    workspaces: number;
    projects: number;
  };
  usage: {
    storage: number;
    aiRequests: number;
    workspaces: number;
    projects: number;
  };
  summary: SubscriptionSummaryDTO;
}

export interface SubscriptionInput {
  planId: string;
  billingCycle?: 'monthly' | 'yearly';
  billingType?: 'credit_card' | 'pix' | 'boleto';
}

export function fetchPlans(): Promise<PlanDTO[]> {
  return request<PlanDTO[]>('/api/subscription/plans');
}

export function fetchSubscriptionStatus(): Promise<QuotaAndBillingStatusDTO> {
  return request<QuotaAndBillingStatusDTO>('/api/subscription/status');
}

export function updateSubscription(input: SubscriptionInput): Promise<QuotaAndBillingStatusDTO> {
  return request<QuotaAndBillingStatusDTO>('/api/subscription', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function cancelPendingPayment(paymentId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/subscription/payment/${encodeURIComponent(paymentId)}`, {
    method: 'DELETE',
  });
}

export function cancelScheduledChange(changeId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/subscription/scheduled-change/${encodeURIComponent(changeId)}`, {
    method: 'DELETE',
  });
}

export type SubscriptionStatusHandler = (status: QuotaAndBillingStatusDTO | null) => void;

export function subscribeToSubscriptionStatus(handler: SubscriptionStatusHandler): () => void {
  const url = '/api/subscription/status/stream';
  let retryCount = 0;
  let retryTimeout: any = null;
  let closed = false;
  let es: EventSource | null = null;

  const onMessage = (evt: MessageEvent) => {
    try {
      const parsed = JSON.parse(evt.data ?? 'null') as QuotaAndBillingStatusDTO | null;
      handler(parsed);
    } catch (err) {
      console.error('[SSE] Error processing subscription status event:', err);
    }
  };

  function connect() {
    if (closed) return;

    es = new EventSource(url, { withCredentials: true });
    es.onmessage = onMessage;

    es.onopen = () => {
      retryCount = 0;
    };

    es.onerror = () => {
      if (closed) return;
      es?.close();

      if (retryCount >= 10) {
        console.warn('[SSE] Reconnection limit reached. Stopping.');
        return;
      }

      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      retryCount++;
      retryTimeout = setTimeout(connect, delay);
    };
  }

  connect();

  return () => {
    closed = true;
    if (retryTimeout) clearTimeout(retryTimeout);
    if (es) {
      es.close();
    }
  };
}

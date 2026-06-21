import { request } from './request';
import { detectUserCountry } from '../utils/location';
import { resolveApiPath } from './api-path';
import type { SubscriptionChangeKind } from '../constants/billing.constants';

export interface PlanDTO {
  id: string;
  name: string;
  description: string;
  price: number;
  annualPrice: number;
  priceUsd: number;
  annualPriceUsd: number;
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
  toPlan?: PlanDTO | null;
  toBillingCycle: 'monthly' | 'yearly';
  toBillingType: 'credit_card' | 'pix' | 'boleto';
  type: 'downgrade' | 'change_cycle';
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
  cpfCnpj?: string;
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
  changeKind?: SubscriptionChangeKind;
}

export interface SubscriptionInput {
  planId: string;
  billingCycle?: 'monthly' | 'yearly';
  billingType?: 'credit_card' | 'pix' | 'boleto';
  cpfCnpj?: string;
  countryCode?: string;
  creditCardToken?: string;
}

export function fetchPlans(): Promise<PlanDTO[]> {
  return request<PlanDTO[]>('/api/subscription/plans', {
    headers: { 'x-user-country': detectUserCountry() },
  });
}

export function fetchDetectedCountry(): Promise<{ country: string }> {
  return request<{ country: string }>('/api/subscription/country');
}

export function fetchSubscriptionStatus(): Promise<QuotaAndBillingStatusDTO> {
  return request<QuotaAndBillingStatusDTO>('/api/subscription/status', {
    headers: { 'x-user-country': detectUserCountry() },
  });
}

export function updateSubscription(input: SubscriptionInput): Promise<QuotaAndBillingStatusDTO> {
  const country = detectUserCountry();
  return request<QuotaAndBillingStatusDTO>('/api/subscription', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-country': country,
    },
    body: JSON.stringify({
      ...input,
      countryCode: input.countryCode || country,
    }),
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
  const url = resolveApiPath('/api/subscription/status/stream');
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

    if (typeof EventSource === 'undefined') {
      console.warn('[SSE] EventSource is not defined in this environment.');
      return;
    }

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

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { SubscriptionPage } from '../../../src/pages/billing/SubscriptionPage';

const mockPlans = [
  {
    id: 'plan-free',
    name: 'Free Plan',
    description: 'Basic features',
    price: 0,
    annualPrice: 0,
    isDefault: true,
    maxWorkspaces: 1,
    maxProjectsPerWorkspace: 3,
    maxAiRequestsPerMonth: 50,
    maxStorageBytes: 5 * 1024 * 1024 * 1024,
  },
  {
    id: 'plan-pro',
    name: 'Pro Plan',
    description: 'Advanced workspace utilities',
    price: 20.00,
    annualPrice: 192.00,
    isDefault: false,
    maxWorkspaces: 3,
    maxProjectsPerWorkspace: 20,
    maxAiRequestsPerMonth: 500,
    maxStorageBytes: 25 * 1024 * 1024 * 1024,
  },
  {
    id: 'plan-enterprise',
    name: 'Enterprise Plan',
    description: 'Corporate features',
    price: 99.00,
    annualPrice: 950.40,
    isDefault: false,
    maxWorkspaces: -1,
    maxProjectsPerWorkspace: -1,
    maxAiRequestsPerMonth: 2000,
    maxStorageBytes: 100 * 1024 * 1024 * 1024,
  }
];

const mockStatus = {
  plan: 'free',
  status: 'active',
  currentPeriodEnd: '2026-07-21T00:00:00Z',
  limits: {
    storage: 5368709120,
    aiRequests: 50,
    workspaces: 1,
    projects: 3,
  },
  usage: {
    storage: 0,
    aiRequests: 0,
    workspaces: 1,
    projects: 0,
  },
  summary: {
    latestSub: {
      userId: 'user-1',
      planId: 'plan-free',
      status: 'active',
      currentPeriodStart: '2026-06-21T00:00:00Z',
      currentPeriodEnd: '2026-07-21T00:00:00Z',
      billingCycle: 'monthly',
      billingType: null,
      nextDueDate: null,
    },
    activeSub: null,
    latestPendingPayment: null,
    scheduledChange: null,
    entitledPlanId: 'plan-free',
    entitledUntil: null,
    hasCreditCardOnFile: false,
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SubscriptionPage', () => {
  it('shows a loading state while billing data is requested', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));

    renderWithAppProviders(<SubscriptionPage />);

    expect(await screen.findByRole('status')).toHaveTextContent('Loading subscription details...');
  });

  it('renders available plans and highlights the current plan', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/subscription/plans')) {
        return Response.json(mockPlans);
      }
      if (url.includes('/api/subscription/status')) {
        return Response.json(mockStatus);
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<SubscriptionPage />);

    expect(await screen.findByText('Free Plan')).toBeInTheDocument();
    expect(await screen.findByText('Pro Plan')).toBeInTheDocument();
    expect(await screen.findByText('Current Plan')).toBeInTheDocument();
  });

  it('shows warning banners for scheduled changes and pending payments', async () => {
    const statusWithWarnings = {
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: '2026-07-21T00:00:00Z',
      limits: {
        storage: 26843545600,
        aiRequests: 500,
        workspaces: 3,
        projects: 20,
      },
      usage: {
        storage: 0,
        aiRequests: 0,
        workspaces: 1,
        projects: 0,
      },
      summary: {
        latestSub: {
          userId: 'user-1',
          planId: 'plan-pro',
          status: 'active',
          currentPeriodStart: '2026-06-21T00:00:00Z',
          currentPeriodEnd: '2026-07-21T00:00:00Z',
          billingCycle: 'monthly',
          billingType: 'credit_card',
          nextDueDate: '2026-07-21T00:00:00Z',
        },
        activeSub: {
          userId: 'user-1',
          planId: 'plan-pro',
          status: 'active',
          currentPeriodStart: '2026-06-21T00:00:00Z',
          currentPeriodEnd: '2026-07-21T00:00:00Z',
          billingCycle: 'monthly',
          billingType: 'credit_card',
          nextDueDate: '2026-07-21T00:00:00Z',
        },
        latestPendingPayment: {
          id: 'pay-1',
          subscriptionId: 'user-1',
          userId: 'user-1',
          gateway: 'asaas',
          gatewayPaymentId: 'pay-gw-1',
          status: 'pending',
          billingType: 'pix',
          kind: 'upgrade',
          value: 49.00,
          dueDate: '2026-07-21T00:00:00Z',
          bankSlipUrl: null,
          pixQrCode: 'mock-pix-code',
          pixQrCodeUrl: 'data:image/png;base64,mock',
          invoiceUrl: null,
          canCancel: true,
        },
        scheduledChange: {
          id: 'change-1',
          userId: 'user-1',
          fromSubscriptionId: 'user-1',
          toPlanId: 'plan-free',
          toBillingCycle: 'monthly',
          toBillingType: 'credit_card',
          type: 'downgrade',
          status: 'scheduled',
          effectiveAt: '2026-07-21T00:00:00Z',
        },
        entitledPlanId: 'plan-pro',
        entitledUntil: '2026-07-21T00:00:00Z',
        hasCreditCardOnFile: false,
      },
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/subscription/plans')) {
        return Response.json(mockPlans);
      }
      if (url.includes('/api/subscription/status')) {
        return Response.json(statusWithWarnings);
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<SubscriptionPage />);

    expect(await screen.findByText(/Scheduled Downgrade/)).toBeInTheDocument();
    expect(await screen.findByText(/Pending invoice/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel invoice' })).toBeInTheDocument();
  });

  it('shows card-on-file notice and hides cancel for recurring renewal charges', async () => {
    const statusWithRenewal = {
      ...mockStatus,
      summary: {
        ...mockStatus.summary,
        hasCreditCardOnFile: true,
        latestPendingPayment: {
          id: 'pay-renewal',
          subscriptionId: 'user-1',
          userId: 'user-1',
          gateway: 'asaas',
          gatewayPaymentId: 'pay-gw-renewal',
          status: 'pending',
          billingType: 'credit_card',
          kind: 'recurring',
          value: 20,
          dueDate: '2099-07-21T00:00:00Z',
          bankSlipUrl: null,
          pixQrCode: null,
          pixQrCodeUrl: null,
          invoiceUrl: 'https://invoice.example',
          canCancel: false,
        },
      },
    };

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/subscription/plans')) {
        return Response.json(mockPlans);
      }
      if (url.includes('/api/subscription/status')) {
        return Response.json(statusWithRenewal);
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<SubscriptionPage />);

    expect(await screen.findByText(/Card on file:/)).toBeInTheDocument();
    expect(await screen.findByText(/Upcoming renewal/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel invoice' })).not.toBeInTheDocument();
  });

  it('opens cycle choice modal when clicking upgrade plan', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/subscription/plans')) {
        return Response.json(mockPlans);
      }
      if (url.includes('/api/subscription/status')) {
        return Response.json(mockStatus);
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<SubscriptionPage />);

    const upgradeBtns = await screen.findAllByRole('button', { name: 'Upgrade Plan' });
    fireEvent.click(upgradeBtns[0]);

    expect(await screen.findByText('Choose billing options')).toBeInTheDocument();
  });

  it('shows API error message in the modal if update request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/subscription/plans')) {
        return Response.json(mockPlans);
      }
      if (url.includes('/api/subscription/status')) {
        return Response.json(mockStatus);
      }
      if (url.endsWith('/api/subscription') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          statusCode: 400,
          error: 'Bad Request',
          message: 'A subscription payment is already pending. Please settle or cancel the pending payment before making a new request.'
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<SubscriptionPage />);

    // Click "Upgrade Plan" to open modal
    const upgradeBtns = await screen.findAllByRole('button', { name: 'Upgrade Plan' });
    fireEvent.click(upgradeBtns[0]);

    // Click "Confirm" to submit
    const confirmBtn = await screen.findByRole('button', { name: 'Confirm' });
    fireEvent.click(confirmBtn);

    // Assert error message appears in modal
    expect(await screen.findByText('A subscription payment is already pending. Please settle or cancel the pending payment before making a new request.')).toBeInTheDocument();
  });
});

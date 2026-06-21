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
  summary: {
    latestSub: {
      id: 'sub-1',
      planId: 'plan-free',
      status: 'active',
    },
    latestPendingPayment: null,
    scheduledChange: null,
  }
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
      summary: {
        latestSub: {
          id: 'sub-1',
          planId: 'plan-pro',
          status: 'active',
        },
        latestPendingPayment: {
          id: 'pay-1',
          value: 49.00,
          dueDate: '2026-07-21T00:00:00Z',
          billingType: 'pix',
          pixQrCode: 'mock-pix-code',
          pixQrCodeUrl: 'data:image/png;base64,mock',
          bankSlipUrl: null,
        },
        scheduledChange: {
          id: 'change-1',
          toPlanId: 'plan-free',
          effectiveAt: '2026-07-21T00:00:00Z',
        },
      }
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

    expect(await screen.findByText(/Change scheduled/)).toBeInTheDocument();
    expect(await screen.findByText(/Pending invoice/)).toBeInTheDocument();
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
});

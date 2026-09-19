import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resetRequestStateForTests } from '../../../src/shared/api/request';
import { AiTokenAnalyticsPanel } from '../../../src/widgets/dashboard/AiTokenAnalyticsPanel';
import type { AiTokenAnalyticsResponse } from '../../../src/shared/api/models/ai-token-analytics';

afterEach(() => {
  cleanup();
  resetRequestStateForTests();
  vi.restoreAllMocks();
});

const mockAnalyticsData: AiTokenAnalyticsResponse = {
  totalTokens: 42_000,
  totalInputTokens: 35_000,
  totalOutputTokens: 7_000,
  totalEstimatedCostUsd: 0.1875,
  totalAiSessions: 3,
  topModel: 'claude-3-5-sonnet',
  byModel: [
    {
      model: 'claude-3-5-sonnet',
      totalTokens: 24_000,
      estimatedCostUsd: 0.12,
      sessionCount: 1,
      percentage: 57.1,
    },
    {
      model: 'gpt-5.2',
      totalTokens: 18_000,
      estimatedCostUsd: 0.0675,
      sessionCount: 2,
      percentage: 42.9,
    },
  ],
  byProvider: [
    {
      provider: 'claude-code',
      totalTokens: 24_000,
      estimatedCostUsd: 0.12,
      sessionCount: 1,
      percentage: 57.1,
    },
    {
      provider: 'codex-cli',
      totalTokens: 18_000,
      estimatedCostUsd: 0.0675,
      sessionCount: 2,
      percentage: 42.9,
    },
  ],
  dailyTrend: [
    {
      date: '2026-03-11',
      totalTokens: 36_000,
      estimatedCostUsd: 0.165,
      sessionCount: 2,
    },
    {
      date: '2026-03-12',
      totalTokens: 6_000,
      estimatedCostUsd: 0.0225,
      sessionCount: 1,
    },
  ],
  availableModels: ['claude-3-5-sonnet', 'gpt-5.2'],
  availableProviders: ['claude-code', 'codex-cli'],
};

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <AiTokenAnalyticsPanel workspaceSlug="test-ws" />
    </QueryClientProvider>
  );
}

describe('AiTokenAnalyticsPanel', () => {
  it('renders KPI metrics, model breakdowns, and interactive filter bar', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPanel();

    expect(await screen.findByText(/AI Token Analytics & Costs/i)).toBeInTheDocument();
    expect(screen.getByText('3 sessions')).toBeInTheDocument();
    expect(screen.getByText('$0.1875')).toBeInTheDocument();
    expect(screen.getByText('42.0k')).toBeInTheDocument();
    expect(screen.getAllByText('claude-3-5-sonnet').length).toBeGreaterThanOrEqual(1);

    // Verify filter inputs exist
    const startDateInput = screen.getByLabelText('Start date (YYYY-MM-DD)');
    const endDateInput = screen.getByLabelText('End date (YYYY-MM-DD)');
    expect(startDateInput).toBeInTheDocument();
    expect(endDateInput).toBeInTheDocument();

    // Presets exist
    expect(screen.getByRole('button', { name: '7D' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30D' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  });

  it('populates date inputs in standard YYYY-MM-DD format when clicking preset', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPanel();

    await screen.findByText(/AI Token Analytics & Costs/i);

    const preset7d = screen.getByRole('button', { name: '7D' });
    fireEvent.click(preset7d);

    const startDateInput = screen.getByLabelText('Start date (YYYY-MM-DD)') as HTMLInputElement;
    const endDateInput = screen.getByLabelText('End date (YYYY-MM-DD)') as HTMLInputElement;

    expect(startDateInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDateInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Reset button should now be visible
    const resetButton = screen.getByRole('button', { name: /Reset Filters/i });
    expect(resetButton).toBeInTheDocument();

    // Clicking reset clears both inputs
    fireEvent.click(resetButton);
    expect(startDateInput.value).toBe('');
    expect(endDateInput.value).toBe('');
  });

  it('allows manual typing in standard format YYYY-MM-DD into date inputs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPanel();

    await screen.findByText(/AI Token Analytics & Costs/i);

    const startDateInput = screen.getByLabelText('Start date (YYYY-MM-DD)') as HTMLInputElement;
    fireEvent.change(startDateInput, { target: { value: '2026-03-01' } });

    expect(startDateInput.value).toBe('2026-03-01');
    expect(screen.getByRole('button', { name: /Reset Filters/i })).toBeInTheDocument();
  });
});

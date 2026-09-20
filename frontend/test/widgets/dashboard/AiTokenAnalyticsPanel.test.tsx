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
  availableProviders: ['claude-code', 'codex-cli', 'antigravity'],
  availableProjects: ['project-alpha', 'project-beta'],
};

function renderPanel(props?: { workspaceSlug?: string; projectSlug?: string }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>
      <AiTokenAnalyticsPanel workspaceSlug="test-ws" {...props} />
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
    expect(screen.getByText('42k')).toBeInTheDocument();
    expect(screen.getAllByText('claude-3-5-sonnet').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('($5.00/1M)')).toBeInTheDocument();
    expect(screen.getByText('($3.75/1M)')).toBeInTheDocument();

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

    await screen.findByText('3 sessions');

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

    await screen.findByText('3 sessions');

    const startDateInput = screen.getByLabelText('Start date (YYYY-MM-DD)') as HTMLInputElement;
    fireEvent.change(startDateInput, { target: { value: '2026-03-01' } });

    expect(startDateInput.value).toBe('2026-03-01');
    expect(screen.getByRole('button', { name: /Reset Filters/i })).toBeInTheDocument();
  });

  it('formats provider names with title casing and known provider labels in provider filter', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPanel();

    await screen.findByText('3 sessions');

    const providerSelect = screen.getByLabelText('Filter by Provider');
    fireEvent.click(providerSelect);

    expect(screen.getByRole('option', { name: 'Antigravity' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Claude Code' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Codex CLI' })).toBeInTheDocument();
  });

  it('switches to the Daily Trend tab without errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPanel();

    await screen.findByText('3 sessions');

    const trendTabBtn = screen.getByRole('button', { name: 'Daily Trend' });
    expect(trendTabBtn).toBeInTheDocument();

    fireEvent.click(trendTabBtn);
    expect(trendTabBtn).toHaveClass('active');
  });

  it('renders project filter before model filter when projectSlug prop is not provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPanel();

    await screen.findByText('3 sessions');

    const projectSelect = screen.getByLabelText('Filter by Project');
    expect(projectSelect).toBeInTheDocument();

    fireEvent.click(projectSelect);
    expect(screen.getByRole('option', { name: 'All Projects' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'project-alpha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'project-beta' })).toBeInTheDocument();
  });

  it('hides project filter when projectSlug prop is provided directly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPanel({ projectSlug: 'project-alpha' });

    await screen.findByText('3 sessions');

    expect(screen.queryByLabelText('Filter by Project')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Filter by Model')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by Provider')).toBeInTheDocument();
  });

  it('masks raw numeric typing into YYYY-MM-DD format dynamically', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPanel();

    await screen.findByText('3 sessions');

    const startDateInput = screen.getByLabelText('Start date (YYYY-MM-DD)') as HTMLInputElement;

    // Typing unmasked digits 20260315
    fireEvent.change(startDateInput, { target: { value: '20260315' } });
    expect(startDateInput.value).toBe('2026-03-15');

    // Partial digits 202603
    fireEvent.change(startDateInput, { target: { value: '202603' } });
    expect(startDateInput.value).toBe('2026-03');
  });

  it('renders calendar buttons and allows clicking to invoke native date selection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPanel();

    await screen.findByText('3 sessions');

    const startCalBtn = screen.getByLabelText('Open calendar for Start date (YYYY-MM-DD)');
    const endCalBtn = screen.getByLabelText('Open calendar for End date (YYYY-MM-DD)');
    expect(startCalBtn).toBeInTheDocument();
    expect(endCalBtn).toBeInTheDocument();

    // Clicking calendar button triggers without errors
    fireEvent.click(startCalBtn);
    fireEvent.click(endCalBtn);
  });
});


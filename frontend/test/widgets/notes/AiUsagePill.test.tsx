import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AiUsagePill } from '../../../src/widgets/notes/AiUsagePill';

afterEach(() => {
  cleanup();
});

describe('AiUsagePill', () => {
  it('renders nothing when usage is undefined or has 0 tokens', () => {
    const { container } = render(<AiUsagePill usage={undefined} />);
    expect(container.firstChild).toBeNull();

    const { container: containerZero } = render(
      <AiUsagePill
        usage={{
          provider: 'claude-code',
          model: 'claude-3-5-sonnet',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        }}
      />
    );
    expect(containerZero.firstChild).toBeNull();
  });

  it('renders single-model usage pill correctly with cost and tooltip', () => {
    render(
      <AiUsagePill
        usage={{
          provider: 'claude-code',
          model: 'claude-3-5-sonnet',
          inputTokens: 20_000,
          outputTokens: 4_000,
          totalTokens: 24_000,
          cachedTokens: 5_000,
          estimatedCostUsd: 0.12,
        }}
      />
    );

    expect(screen.getByText('claude-3-5-sonnet')).toBeInTheDocument();
    expect(screen.getByText('24,000 tok')).toBeInTheDocument();
    expect(screen.getByText('$0.1200')).toBeInTheDocument();
    expect(screen.getByText('⚡')).toBeInTheDocument();
  });

  it('renders multi-model breakdown indicator, tooltip and opens popover on click', () => {
    render(
      <AiUsagePill
        usage={{
          provider: 'claude-code',
          model: 'claude-3-5-sonnet',
          inputTokens: 60_000,
          outputTokens: 4_000,
          totalTokens: 64_000,
          estimatedCostUsd: 0.20,
          byModel: [
            {
              model: 'claude-3-5-sonnet',
              provider: 'claude-code',
              inputTokens: 45_000,
              outputTokens: 3_000,
              totalTokens: 48_000,
              estimatedCostUsd: 0.18,
            },
            {
              model: 'claude-3-5-haiku',
              provider: 'claude-code',
              inputTokens: 15_000,
              outputTokens: 1_000,
              totalTokens: 16_000,
              estimatedCostUsd: 0.02,
            },
          ],
        }}
      />
    );

    expect(screen.getByText('⚡')).toBeInTheDocument();
    expect(screen.getByText('claude-3-5-sonnet (+1)')).toBeInTheDocument();
    expect(screen.getByText('64,000 tok')).toBeInTheDocument();
    expect(screen.getByText('$0.2000')).toBeInTheDocument();
    expect(screen.getByText('ℹ')).toBeInTheDocument();

    const pill = screen.getByTitle(/Multi-Model Session Breakdown/i);
    expect(pill).toBeInTheDocument();
    expect(pill.title).toContain('claude-3-5-sonnet: 48,000 tok ($0.1800)');
    expect(pill.title).toContain('claude-3-5-haiku: 16,000 tok ($0.0200)');
    expect(pill.title).toContain('Total: 64,000 tok • $0.2000');

    // Click pill to open popover
    fireEvent.click(pill);
    expect(screen.getByRole('dialog', { name: /Multi-Model Usage Breakdown/i })).toBeInTheDocument();
    expect(screen.getByText('48,000 tok (75%)')).toBeInTheDocument();
    expect(screen.getByText('16,000 tok (25%)')).toBeInTheDocument();
  });
});

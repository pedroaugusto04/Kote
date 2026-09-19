import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatCostComparison, formatCostPerMillion, formatModelRate, formatProviderName, formatRelativeTimeUntil, formatUsDate, reminderDisplayDateTime } from '../../../src/shared/utils/format';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatUsDate', () => {
  it('formats plain ISO dates as MM/DD/YYYY', () => {
    expect(formatUsDate('2026-04-29')).toBe('04/29/2026');
  });

  it('formats ISO timestamps without timezone drift', () => {
    const parsed = new Date('2026-04-29T23:25:09.013Z');
    const expected = `${String(parsed.getMonth() + 1).padStart(2, '0')}/${String(parsed.getDate()).padStart(2, '0')}/${parsed.getFullYear()}`;
    expect(formatUsDate('2026-04-29T23:25:09.013Z')).toBe(expected);
  });

  it('preserves non-date values when parsing fails', () => {
    expect(formatUsDate('sem-data')).toBe('sem-data');
  });
});

describe('reminderDisplayDateTime', () => {
  it('formats UTC reminder timestamps using the user time zone display pattern', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      calendar: 'gregory',
      locale: 'en-US',
      numberingSystem: 'latn',
      timeZone: 'America/Sao_Paulo',
    });

    expect(reminderDisplayDateTime({ reminderAt: '2026-04-27T12:30:00.000Z' })).toBe('2026-04-27 09:30:00');
  });
});

describe('formatRelativeTimeUntil', () => {
  const baseNow = new Date('2026-09-10T12:00:00.000Z');

  it('returns empty string for missing or invalid dates', () => {
    expect(formatRelativeTimeUntil(undefined, baseNow)).toBe('');
    expect(formatRelativeTimeUntil(null, baseNow)).toBe('');
    expect(formatRelativeTimeUntil('invalid-date', baseNow)).toBe('');
  });

  it('returns shortly for past or immediate dates', () => {
    expect(formatRelativeTimeUntil('2026-09-10T11:59:00.000Z', baseNow)).toBe('shortly');
    expect(formatRelativeTimeUntil('2026-09-10T12:00:00.000Z', baseNow)).toBe('shortly');
    expect(formatRelativeTimeUntil('2026-09-10T12:00:20.000Z', baseNow)).toBe('shortly');
  });

  it('formats remaining minutes', () => {
    expect(formatRelativeTimeUntil('2026-09-10T12:45:00.000Z', baseNow)).toBe('in 45m');
    expect(formatRelativeTimeUntil('2026-09-10T12:05:00.000Z', baseNow)).toBe('in 5m');
  });

  it('formats remaining hours', () => {
    expect(formatRelativeTimeUntil('2026-09-11T11:00:00.000Z', baseNow)).toBe('in 23h');
    expect(formatRelativeTimeUntil('2026-09-10T14:00:00.000Z', baseNow)).toBe('in 2h');
  });

  it('formats remaining days', () => {
    expect(formatRelativeTimeUntil('2026-09-13T12:00:00.000Z', baseNow)).toBe('in 3d');
  });
});

describe('formatProviderName', () => {
  it('formats known AI providers with proper casing and names', () => {
    expect(formatProviderName('antigravity')).toBe('Antigravity');
    expect(formatProviderName('claude-code')).toBe('Claude Code');
    expect(formatProviderName('claude')).toBe('Claude');
    expect(formatProviderName('codex-cli')).toBe('Codex CLI');
    expect(formatProviderName('codex')).toBe('Codex');
    expect(formatProviderName('open-code')).toBe('OpenCode');
    expect(formatProviderName('opencode')).toBe('OpenCode');
    expect(formatProviderName('cursor')).toBe('Cursor');
    expect(formatProviderName('gemini')).toBe('Gemini');
    expect(formatProviderName('copilot')).toBe('Copilot');
  });

  it('formats generic or kebab-case provider identifiers into title case', () => {
    expect(formatProviderName('custom-provider')).toBe('Custom Provider');
    expect(formatProviderName('ollama')).toBe('Ollama');
    expect(formatProviderName('my_tool')).toBe('My Tool');
  });

  it('handles empty and null values gracefully', () => {
    expect(formatProviderName('')).toBe('');
    expect(formatProviderName(null)).toBe('');
    expect(formatProviderName(undefined)).toBe('');
  });
});

describe('formatCostPerMillion', () => {
  it('calculates and formats cost per 1M tokens with appropriate decimals', () => {
    // 24k tokens costing $0.12 = $5.00/1M
    expect(formatCostPerMillion(0.12, 24_000)).toBe('$5.00/1M');
    // 18k tokens costing $0.0675 = $3.75/1M
    expect(formatCostPerMillion(0.0675, 18_000)).toBe('$3.75/1M');
    // 1M tokens costing $15.00 = $15.00/1M
    expect(formatCostPerMillion(15.00, 1_000_000)).toBe('$15.00/1M');
    // 0 cost (free) = $0.00/1M
    expect(formatCostPerMillion(0, 50_000)).toBe('$0.00/1M');
  });

  it('formats very small rates with up to 4 decimal places', () => {
    // 100k tokens costing $0.0005 = $0.0050/1M
    expect(formatCostPerMillion(0.0005, 100_000)).toBe('$0.0050/1M');
  });

  it('handles missing or zero token values gracefully', () => {
    expect(formatCostPerMillion(undefined, 1000)).toBe('');
    expect(formatCostPerMillion(null, 1000)).toBe('');
    expect(formatCostPerMillion(0.5, 0)).toBe('');
    expect(formatCostPerMillion(0.5, undefined)).toBe('');
  });
});

describe('formatModelRate & formatCostComparison', () => {
  it('formats model reference rates', () => {
    expect(formatModelRate({ inputPerMillion: 3, outputPerMillion: 15 })).toBe('$3 in / $15 out');
    expect(formatModelRate({ inputPerMillion: 0, outputPerMillion: 0 })).toBe('grátis');
    expect(formatModelRate({ inputPerMillion: 2.5, outputPerMillion: 2.5 })).toBe('$2.50/1M');
    expect(formatModelRate(undefined)).toBe('');
    expect(formatModelRate(null)).toBe('');
  });

  it('formats side-by-side comparison of session cost and model reference rate', () => {
    expect(formatCostComparison(0.12, 24_000, { inputPerMillion: 3, outputPerMillion: 15 })).toBe(
      'sessão: $5.00/1M • ref: $3 in / $15 out'
    );
    expect(formatCostComparison(0, 50_000, { inputPerMillion: 0, outputPerMillion: 0 })).toBe(
      'sessão: $0.00/1M • ref: grátis'
    );
  });

  it('falls back gracefully when rates or session metrics are missing', () => {
    expect(formatCostComparison(0.12, 24_000)).toBe('$5.00/1M');
    expect(formatCostComparison(null, null, { inputPerMillion: 3, outputPerMillion: 15 })).toBe(
      'ref: $3 in / $15 out'
    );
    expect(formatCostComparison(null, null, null)).toBe('');
  });
});


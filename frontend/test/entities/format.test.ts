import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatUsDate, reminderDisplayDateTime } from '../../src/entities/format';

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

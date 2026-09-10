import { formatRelativeTimeUntil, formatUsDate, reminderDisplayDateTime } from '../../../src/shared/utils/format';

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


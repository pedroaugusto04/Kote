export const DEFAULT_APP_TIMEZONE = 'America/Sao_Paulo';

let configuredDefaultAppTimeZone: string = DEFAULT_APP_TIMEZONE;

export function setDefaultAppTimeZone(timeZone: string | null | undefined): void {
  configuredDefaultAppTimeZone = normalizeTimeZone(timeZone || DEFAULT_APP_TIMEZONE);
}

export function getDefaultAppTimeZone(): string {
  return configuredDefaultAppTimeZone;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeTimeZone(value: string | null | undefined): string {
  const candidate = String(value || '').trim();
  if (!candidate) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'UTC';
  }
}

function dateTimeParts(date: Date, timeZone: string): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = dateTimeParts(date, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

function isValidDate(year: string | number, month: string | number, day: string | number) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

export function normalizeDate(value: string, timeZone = 'UTC'): string {
  const text = String(value || '').trim();
  if (!text) return '';

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    if (isValidDate(year, month, day)) {
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    if (isValidDate(year, month, day)) {
      return `${year}-${month}-${day}`;
    }
  }

  const lower = text.toLowerCase();
  const today = new Date();
  if (['hoje', 'today'].includes(lower)) {
    return formatDateInTimeZone(today, timeZone);
  }
  if (['amanha', 'amanhã', 'tomorrow'].includes(lower)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateInTimeZone(tomorrow, timeZone);
  }

  return '';
}

export function normalizeTime(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function buildReminderAt(date: string, time: string, timeZone = 'UTC'): string {
  if (!date || !time) return '';
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const zone = normalizeTimeZone(timeZone);
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let offset = timeZoneOffsetMs(new Date(utcGuess), zone);
  let timestamp = utcGuess - offset;
  const correctedOffset = timeZoneOffsetMs(new Date(timestamp), zone);
  if (correctedOffset !== offset) timestamp = utcGuess - correctedOffset;
  return new Date(timestamp).toISOString();
}

export function dateTimePartsInUtc(value: string): { date: string; time: string; iso: string } {
  const timestamp = Date.parse(String(value || '').trim());
  if (!Number.isFinite(timestamp)) return { date: '', time: '', iso: '' };
  const parsed = new Date(timestamp);
  return {
    date: `${String(parsed.getUTCFullYear()).padStart(4, '0')}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`,
    time: `${String(parsed.getUTCHours()).padStart(2, '0')}:${String(parsed.getUTCMinutes()).padStart(2, '0')}`,
    iso: parsed.toISOString(),
  };
}

export function buildUtcReminderFields(input: {
  reminderDate?: string;
  reminderTime?: string;
  reminderAt?: string;
  timeZone?: string;
  defaultTime?: string;
}): { reminderDate: string; reminderTime: string; reminderAt: string } {
  const existing = dateTimePartsInUtc(input.reminderAt || '');
  if (existing.iso) {
    return {
      reminderDate: existing.date,
      reminderTime: existing.time,
      reminderAt: existing.iso,
    };
  }

  const reminderDate = normalizeDate(input.reminderDate || '', input.timeZone || 'UTC');
  if (!reminderDate) return { reminderDate: '', reminderTime: '', reminderAt: '' };

  const reminderTime = normalizeTime(input.reminderTime || '') || normalizeTime(input.defaultTime || '') || '09:00';
  const utc = dateTimePartsInUtc(buildReminderAt(reminderDate, reminderTime, input.timeZone || 'UTC'));
  return {
    reminderDate: utc.date,
    reminderTime: utc.time,
    reminderAt: utc.iso,
  };
}

export function getUtcParts(date = new Date()): {
  year: string;
  month: string;
  day: string;
  time: string;
} {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const time = `${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}`;
  return { year, month, day, time };
}

export function formatDateInTimeZone(date: Date, timeZone = 'UTC'): string {
  const parts = dateTimeParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatTimeInTimeZone(date: Date, timeZone = 'UTC'): string {
  const parts = dateTimeParts(date, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

export function formatDateTimeInTimeZone(date: Date, timeZone = 'UTC'): string {
  const parts = dateTimeParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function getTimeZoneOffsetString(date = new Date(), timeZone = 'UTC'): string {
  const zone = normalizeTimeZone(timeZone);
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
    const match = offsetPart.match(/GMT([+-]\d{1,2}(?::\d{2})?)/);
    if (!match) return '+00:00';
    const raw = match[1];
    const sign = raw.startsWith('-') ? '-' : '+';
    const cleaned = raw.replace(/[+-]/, '');
    const [hours, minutes = '00'] = cleaned.split(':');
    return `${sign}${hours.padStart(2, '0')}:${minutes.padEnd(2, '0')}`;
  } catch {
    return '+00:00';
  }
}

export function currentDateTimeInTimeZone(timeZone = 'UTC', now = new Date()): { date: string; time: string; offset: string } {
  return {
    date: formatDateInTimeZone(now, timeZone),
    time: formatTimeInTimeZone(now, timeZone),
    offset: getTimeZoneOffsetString(now, timeZone),
  };
}

export function normalizeReminderAtToUtc(value: unknown, timeZone = 'UTC'): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const zone = normalizeTimeZone(timeZone);

  // Check if string already contains an explicit timezone offset or Z after time
  const hasTimeOffset = /(?:T|\s)\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/i.test(raw);
  if (!hasTimeOffset) {
    // Matches YYYY-MM-DD[T ]HH:mm[:ss]
    const isoWithoutOffset = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/);
    if (isoWithoutOffset) {
      const [, datePart, timePart] = isoWithoutOffset;
      return buildReminderAt(datePart, timePart, zone);
    }

    // Matches DD/MM/YYYY[T ]HH:mm[:ss]
    const brDateTime = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[T ](\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/);
    if (brDateTime) {
      const [, day, month, year, timePart] = brDateTime;
      return buildReminderAt(`${year}-${month}-${day}`, timePart, zone);
    }

    // Matches YYYY-MM-DD (date only, defaults to 09:00 in specified timezone)
    const isoDateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (isoDateOnly) {
      return buildReminderAt(isoDateOnly[1], '09:00', zone);
    }

    // Matches DD/MM/YYYY (date only, defaults to 09:00 in specified timezone)
    const brDateOnly = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brDateOnly) {
      const [, day, month, year] = brDateOnly;
      return buildReminderAt(`${year}-${month}-${day}`, '09:00', zone);
    }
  }

  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateInTimeZone(date, 'UTC');
}

/**
 * Normalizes any incoming event/occurredAt timestamp representation to strict UTC ISO-8601 (ending with 'Z').
 * If a naive local timestamp (e.g. 'YYYY-MM-DD HH:mm:ss') without timezone is provided,
 * it is interpreted in the user's fallback timezone (default: America/Sao_Paulo) rather than arbitrary server TZ.
 */
export function normalizeOccurredAtToUtc(value: unknown, fallbackTimeZone = getDefaultAppTimeZone()): string {
  if (!value) return nowIso();
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? nowIso() : value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(timestamp).toISOString();
  }

  const raw = String(value).trim();
  if (!raw) return nowIso();

  // If already contains Z or explicit timezone offset (+HH:mm or -HH:mm)
  const hasTimeOffset = /(?:T|\s)\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)$/i.test(raw);
  if (hasTimeOffset) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : nowIso();
  }

  // Matches YYYY-MM-DD[T ]HH:mm[:ss] without timezone offset: interpret in fallback user timezone
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/);
  if (isoMatch) {
    const [, datePart, timePart] = isoMatch;
    return buildReminderAt(datePart, timePart, fallbackTimeZone);
  }

  // Matches DD/MM/YYYY[T ]HH:mm[:ss] without timezone offset
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[T ](\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/);
  if (brMatch) {
    const [, day, month, year, timePart] = brMatch;
    return buildReminderAt(`${year}-${month}-${day}`, timePart, fallbackTimeZone);
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : nowIso();
}


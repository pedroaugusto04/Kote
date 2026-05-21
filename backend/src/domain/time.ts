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

export function formatTimeInTimeZone(date: Date, timeZone = 'UTC'): string {
  const parts = dateTimeParts(date, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

export function formatDateTimeInTimeZone(date: Date, timeZone = 'UTC'): string {
  const parts = dateTimeParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function currentDateTimeInTimeZone(timeZone = 'UTC', now = new Date()): { date: string; time: string } {
  return {
    date: formatDateInTimeZone(now, timeZone),
    time: formatTimeInTimeZone(now, timeZone),
  };
}

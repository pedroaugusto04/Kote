const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeDate(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      parsed.getUTCFullYear() === Number(year) &&
      parsed.getUTCMonth() === Number(month) - 1 &&
      parsed.getUTCDate() === Number(day)
    ) {
      return `${year}-${month}-${day}`;
    }
    return '';
  }

  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      parsed.getUTCFullYear() === Number(year) &&
      parsed.getUTCMonth() === Number(month) - 1 &&
      parsed.getUTCDate() === Number(day)
    ) {
      return `${year}-${month}-${day}`;
    }
  }

  const lower = text.toLowerCase();
  const today = new Date();
  if (['hoje', 'today'].includes(lower)) {
    return dateFormatter.format(today);
  }
  if (['amanha', 'amanhã', 'tomorrow'].includes(lower)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return dateFormatter.format(tomorrow);
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

export function buildReminderAt(date: string, time: string): string {
  if (!date || !time) return '';
  return `${date}T${time}:00-03:00`;
}

export function getSaoPauloParts(date = new Date()): {
  year: string;
  month: string;
  day: string;
  time: string;
} {
  const [year, month, day] = dateFormatter.format(date).split('-');
  const time = timeFormatter.format(date).replace(/:/g, '');
  return { year, month, day, time };
}

export function currentSaoPauloDateTime(now = new Date()): { date: string; time: string } {
  return {
    date: dateFormatter.format(now),
    time: timeFormatter.format(now).slice(0, 5),
  };
}

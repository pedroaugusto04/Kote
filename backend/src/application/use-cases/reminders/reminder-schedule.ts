import { buildUtcReminderFields, formatDateTimeInTimeZone, normalizeDate, normalizeTime } from '../../../domain/time.js';

export const DEFAULT_REMINDER_TIME = '09:00';

export function resolveReminderScheduledAt(
  input: { reminderDate?: unknown; reminderTime?: unknown; reminderAt?: unknown },
  timeZone = 'America/Sao_Paulo',
): string {
  const reminderAt = String(input.reminderAt || '').trim();
  if (reminderAt) return buildUtcReminderFields({ reminderAt }).reminderAt;

  const reminderDate = normalizeDate(String(input.reminderDate || ''), 'UTC');
  if (!reminderDate) return '';

  const reminderTime = normalizeTime(String(input.reminderTime || '')) || DEFAULT_REMINDER_TIME;
  return buildUtcReminderFields({ reminderDate, reminderTime, timeZone: 'UTC' }).reminderAt;
}

export function reminderDispatchKey(scheduledAt: string): string {
  return String(scheduledAt || '').slice(0, 16);
}

export function formatReminderScheduledAtLabel(scheduledAt: string): string {
  const value = String(scheduledAt || '').trim();
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return formatDateTimeInTimeZone(new Date(timestamp), 'America/Sao_Paulo');
}

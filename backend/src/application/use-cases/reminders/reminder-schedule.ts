import { formatDateTimeInTimeZone } from '../../../domain/time.js';

export function resolveReminderScheduledAt(
  input: { reminderAt?: unknown },
  timeZone = 'America/Sao_Paulo',
): string {
  const reminderAt = String(input.reminderAt || '').trim();
  if (!reminderAt) return '';
  
  // reminderAt is now a full ISO timestamp, return it directly
  return reminderAt;
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

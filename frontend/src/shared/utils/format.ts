import type { Project } from '../api/models/project';

const DEFAULT_USER_TIME_ZONE = 'America/Sao_Paulo';

export function projectName(projects: Project[], slug: string) {
  return projects.find((project) => project.projectSlug === slug)?.displayName || slug;
}

function userTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_USER_TIME_ZONE;
}

function dateTimePartsInUserTimeZone(value: string | null | undefined, timeZone = userTimeZone()) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(parsed);
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

function buildUsDate(parsed: Date) {
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const year = String(parsed.getFullYear());
  return `${month}/${day}/${year}`;
}

export function formatUsDate(value: string | null | undefined) {
  if (!value) return '';

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${month}/${day}/${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return buildUsDate(parsed);
}

export function formatUsDateTime(value: string | null | undefined) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const datePart = buildUsDate(parsed);
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}`;
}

export function formatDateInUserTimeZone(value: string | null | undefined) {
  const parts = dateTimePartsInUserTimeZone(value);
  if (!parts) return value || '';
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatTimeInUserTimeZone(value: string | null | undefined) {
  const parts = dateTimePartsInUserTimeZone(value);
  if (!parts) return '';
  return `${parts.hour}:${parts.minute}`;
}

export function reminderDisplayDateTime(input: { reminderAt?: string; reminderDate?: string; reminderTime?: string }) {
  if (input.reminderAt) return formatDateTimeInUserTimeZone(input.reminderAt);
  if (!input.reminderDate) return '';
  return `${input.reminderDate} ${input.reminderTime || '00:00'}:00`;
}

export function reminderInputDate(input: { reminderAt?: string; reminderDate?: string }) {
  return input.reminderAt ? formatDateInUserTimeZone(input.reminderAt) : input.reminderDate || '';
}

export function reminderInputTime(input: { reminderAt?: string; reminderTime?: string }) {
  return input.reminderAt ? formatTimeInUserTimeZone(input.reminderAt) : input.reminderTime || '';
}

function formatDateTimeInUserTimeZone(value: string | null | undefined) {
  const parts = dateTimePartsInUserTimeZone(value);
  if (!parts) return value || '';
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function noteTypeLabel(type: string) {
  return formatDisplayToken(type);
}

export function typeIcon(type: string) {
  return (
    {
      note: 'N',
      event: 'E',
      knowledge: 'K',
      decision: 'D',
      incident: 'B',
      bug: 'B',
      review: 'R',
      reminder: 'T',
      article: 'A',
      asset: 'S',
    }[type] || 'F'
  );
}

export function formatDisplayToken(value: string | null | undefined) {
  return (value || '')
    .trim()
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function getCleanSummary(summary: string | undefined): string {
  if (!summary) return '';
  // Replace newlines and carriage returns with spaces
  let text = summary.replace(/\r?\n/g, ' ');
  // Collapse multiple spaces
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 200) {
    return text.substring(0, 200) + '...';
  }
  return text;
}

export function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSourceLabel(source: string | null | undefined): string {
  if (!source) return '';
  const normalized = source.toLowerCase().trim();
  if (normalized.includes('whatsapp')) return 'WhatsApp';
  if (normalized.includes('github')) return 'GitHub';
  if (normalized.includes('n8n')) return 'n8n';
  if (normalized === 'ai-chat') return 'AI';
  if (normalized === 'open-code' || normalized === 'opencode') return 'Open Code';
  if (normalized === 'antigravity') return 'Antigravity';
  if (normalized === 'codex') return 'Codex';
  if (normalized.includes('claude')) return 'Claude Code';
  if (normalized === 'manual-api' || normalized === 'manual') return 'Manual';
  return formatDisplayToken(source);
}

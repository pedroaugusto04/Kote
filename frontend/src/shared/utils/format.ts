import type { Project } from '../api/models/project';
import { stripSourceHeader } from './text';

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
  const cleaned = stripSourceHeader(summary);
  // Replace newlines and carriage returns with spaces
  let text = cleaned.replace(/\r?\n/g, ' ');
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

export function getSourceConfig(source: string | null | undefined): { label: string; tagClass: string } {
  if (!source) {
    return { label: '', tagClass: 'manual' };
  }
  const normalized = source.toLowerCase().trim();
  if (normalized.includes('whatsapp') || normalized.includes('evolution')) {
    return { label: 'WhatsApp', tagClass: 'whatsapp' };
  }
  if (normalized.includes('github')) {
    return { label: 'GitHub', tagClass: 'github' };
  }
  if (
    normalized === 'ai-chat' ||
    normalized.includes('antigravity') ||
    normalized.includes('codex') ||
    normalized.includes('claude') ||
    normalized.includes('open-code') ||
    normalized.includes('opencode')
  ) {
    let label = 'AI';
    if (normalized.includes('open-code') || normalized.includes('opencode')) label = 'Open Code';
    else if (normalized.includes('antigravity')) label = 'Antigravity';
    else if (normalized.includes('codex')) label = 'Codex';
    else if (normalized.includes('claude')) label = 'Claude Code';
    return { label, tagClass: 'ai' };
  }
  if (normalized === 'manual-api' || normalized === 'manual') {
    return { label: 'Manual', tagClass: 'manual' };
  }
  if (normalized.includes('n8n') || normalized.includes('api')) {
    const label = normalized.includes('n8n') ? 'n8n' : 'API';
    return { label, tagClass: 'api' };
  }
  return { label: formatDisplayToken(source), tagClass: 'manual' };
}

export function formatSourceLabel(source: string | null | undefined): string {
  return getSourceConfig(source).label;
}

export function getSourceTagClass(source: string | null | undefined): string {
  return getSourceConfig(source).tagClass;
}

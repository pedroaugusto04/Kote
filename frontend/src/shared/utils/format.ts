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

export function reminderDisplayDateTime(input: { reminderAt?: string }) {
  if (input.reminderAt) return formatDateTimeInUserTimeZone(input.reminderAt);
  return '';
}

export function reminderInputDate(input: { reminderAt?: string }) {
  return input.reminderAt ? formatDateInUserTimeZone(input.reminderAt) : '';
}

export function reminderInputTime(input: { reminderAt?: string }) {
  return input.reminderAt ? formatTimeInUserTimeZone(input.reminderAt) : '';
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
  const text = collapseWhitespace(cleaned);
  if (text.length > 200) {
    return text.substring(0, 200) + '...';
  }
  return text;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const SOURCE_VALUES = {
  KOTE: 'kote',
  WHATSAPP: 'whatsapp',
  GITHUB: 'github',
  GITHUB_PUSH: 'github-push',
  WHATSAPP_CHANNEL: 'whatsapp',
  AI_CHAT: 'ai-chat',
  CLI: 'cli',
  IDE: 'ide',
  EXTERNAL: 'external',
  WEB_CLIPPER: 'web-clipper',
  MANUAL_API: 'manual-api',
  MANUAL: 'manual',
} as const;

export type SourceValue = (typeof SOURCE_VALUES)[keyof typeof SOURCE_VALUES];

export enum SourceTagClass {
  Kote = 'kote',
  WhatsApp = 'whatsapp',
  GitHub = 'github',
  WebClipper = 'web-clipper',
  AiOpenCode = 'ai-opencode',
  AiAntigravity = 'ai-antigravity',
  AiCodex = 'ai-codex',
  AiClaude = 'ai-claude',
  Ai = 'ai',
  Ide = 'ide',
  Manual = 'manual',
  Api = 'api',
}

type SourceConfig = { label: string; tagClass: string };
type SourceRule = SourceConfig & { matches: (normalizedSource: string) => boolean };

const sourceRules: SourceRule[] = [
  {
    label: 'Kote',
    tagClass: SourceTagClass.Kote,
    matches: (source) => source === SOURCE_VALUES.KOTE,
  },
  {
    label: 'WhatsApp',
    tagClass: SourceTagClass.WhatsApp,
    matches: (source) => source.includes('whatsapp') || source.includes('evolution'),
  },
  {
    label: 'GitHub',
    tagClass: SourceTagClass.GitHub,
    matches: (source) => source.includes('github'),
  },
  {
    label: 'Web Clipper',
    tagClass: SourceTagClass.WebClipper,
    matches: (source) => source === SOURCE_VALUES.WEB_CLIPPER || source.startsWith('http://') || source.startsWith('https://'),
  },
  {
    label: 'IDE',
    tagClass: SourceTagClass.Ide,
    matches: (source) => source === SOURCE_VALUES.IDE || source.includes('ide') || source.includes('vscode'),
  },
  {
    label: 'Open Code',
    tagClass: SourceTagClass.AiOpenCode,
    matches: (source) => source.includes('open-code') || source.includes('opencode'),
  },
  {
    label: 'Antigravity',
    tagClass: SourceTagClass.AiAntigravity,
    matches: (source) => source.includes('antigravity'),
  },
  {
    label: 'Codex',
    tagClass: SourceTagClass.AiCodex,
    matches: (source) => source.includes('codex'),
  },
  {
    label: 'Claude Code',
    tagClass: SourceTagClass.AiClaude,
    matches: (source) => source.includes('claude'),
  },
  {
    label: 'AI',
    tagClass: SourceTagClass.Ai,
    matches: (source) => source === SOURCE_VALUES.AI_CHAT,
  },
  {
    label: 'CLI',
    tagClass: SourceTagClass.Manual,
    matches: (source) => source === SOURCE_VALUES.CLI,
  },
  {
    label: 'Manual',
    tagClass: SourceTagClass.Manual,
    matches: (source) => source === SOURCE_VALUES.MANUAL_API || source === SOURCE_VALUES.MANUAL || source === SOURCE_VALUES.EXTERNAL,
  },
  {
    label: 'API',
    tagClass: SourceTagClass.Api,
    matches: (source) => source.includes('api'),
  },
];

export function getSourceConfig(source: string | null | undefined): { label: string; tagClass: string } {
  if (!source) {
    return { label: '', tagClass: SourceTagClass.Manual };
  }
  const normalized = source.toLowerCase().trim();
  const matchingRule = sourceRules.find((rule) => rule.matches(normalized));
  if (matchingRule) return { label: matchingRule.label, tagClass: matchingRule.tagClass };
  return { label: formatDisplayToken(source), tagClass: SourceTagClass.Manual };
}

export function formatSourceLabel(source: string | null | undefined): string {
  return getSourceConfig(source).label;
}

export function getSourceTagClass(source: string | null | undefined): string {
  return getSourceConfig(source).tagClass;
}

export function formatDateIso(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function getTimelineNodeColor(category: string, type?: string) {
  if (category === SOURCE_VALUES.GITHUB_PUSH) return 'var(--cyan)';
  if (category === SOURCE_VALUES.WHATSAPP_CHANNEL) return 'var(--green)';
  if (category === 'reminder') return 'var(--amber)';
  if (category === SOURCE_VALUES.AI_CHAT) return 'var(--purple)';
  return 'var(--muted)';
}

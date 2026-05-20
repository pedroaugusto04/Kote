import type { Project } from '../shared/api/models/project';

export function projectName(projects: Project[], slug: string) {
  return projects.find((project) => project.projectSlug === slug)?.displayName || slug;
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
  return String(value || '')
    .trim()
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

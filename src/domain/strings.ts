export function slugify(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function sanitizeFileStem(value: string, fallback = 'entry'): string {
  return slugify(value) || fallback;
}

export function trimText(value: string, fallback = ''): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

export function normalizeMultiline(value: string): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function stripMarkdownFences(value: string): string {
  return String(value || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

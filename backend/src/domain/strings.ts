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

export function normalizeComparableText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
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

export function getBase64ByteLength(base64: string): number {
  if (!base64) return 0;
  const trimmed = base64.trim();
  const len = trimmed.length;
  if (len === 0) return 0;
  let padding = 0;
  if (trimmed.endsWith('==')) {
    padding = 2;
  } else if (trimmed.endsWith('=')) {
    padding = 1;
  }
  return (len * 3) / 4 - padding;
}

export function calculateAttachmentSize(sizeBytes?: number | null, dataBase64?: string | null): number {
  if (sizeBytes && sizeBytes > 0) {
    return sizeBytes;
  }
  if (dataBase64) {
    return getBase64ByteLength(dataBase64);
  }
  return 0;
}

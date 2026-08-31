import { sanitizeFileName } from '../utils/text';

export function parseCommaSeparatedList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

export function slugifyInput(value: string | null | undefined): string {
  return sanitizeFileName(value, '');
}


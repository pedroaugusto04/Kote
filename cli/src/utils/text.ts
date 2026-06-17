export function collapseWhitespace(value: string): string {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

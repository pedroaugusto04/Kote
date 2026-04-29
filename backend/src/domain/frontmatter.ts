export function toFrontmatterValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => JSON.stringify(String(item))).join(', ')}]`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value == null) return 'null';
  if (typeof value === 'number') return String(value);
  return JSON.stringify(String(value));
}

export function renderFrontmatter(values: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}: ${toFrontmatterValue(value)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

export function parseFrontmatter(content: string): Record<string, unknown> {
  const match = String(content || '').match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return {};
  const result: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const rawValue = line.slice(index + 1).trim();
    try {
      result[key] = JSON.parse(rawValue);
    } catch {
      result[key] = rawValue;
    }
  }
  return result;
}

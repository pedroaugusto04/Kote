export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function firstRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const first = value.find((entry) => isRecord(entry));
    return first ?? {};
  }
  return asRecord(value);
}

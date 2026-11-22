export function normalizeFilePath(value: unknown): string {
  let path = String(value || '')
    .trim()
    .replace(/\\/g, '/');

  while (path.startsWith('./')) {
    path = path.slice(2);
  }
  while (path.startsWith('/')) {
    path = path.slice(1);
  }
  while (path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path;
}

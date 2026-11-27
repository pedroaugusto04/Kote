export function absoluteUrl(baseUrl: string, pathname: string): string {
  if (!baseUrl) return pathname;
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${baseUrl}${normalizedPath}`;
}

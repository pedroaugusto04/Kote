export function inlineContentDisposition(fileName: string): string {
  const sanitizedFileName = (fileName || 'attachment')
    .replace(/[\\/\u0000-\u001f\u007f\u0080-\uFFFF"]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 200);
  const encodedFileName = encodeURIComponent(sanitizedFileName);
  return `inline; filename="${sanitizedFileName}"; filename*=UTF-8''${encodedFileName}`;
}

export function paginatedResponse<T>(key: string, value: { items: T[]; pagination: unknown }) {
  return { [key]: value.items, pagination: value.pagination };
}

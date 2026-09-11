function contentDisposition(fileName: string, disposition: 'inline' | 'attachment'): string {
  const sanitizedFileName = (fileName || 'attachment')
    .replace(/[\\/\u0000-\u001f\u007f\u0080-\uFFFF"]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 200);
  const encodedFileName = encodeURIComponent(sanitizedFileName);
  return `${disposition}; filename="${sanitizedFileName}"; filename*=UTF-8''${encodedFileName}`;
}

export function inlineContentDisposition(fileName: string): string {
  return contentDisposition(fileName, 'inline');
}

export function attachmentContentDisposition(fileName: string): string {
  return contentDisposition(fileName, 'attachment');
}

export function paginatedResponse<T>(key: string, value: { items: T[]; pagination: unknown }) {
  return { [key]: value.items, pagination: value.pagination };
}

export const SUPPORTED_MIME_TYPES = new Set([
  // Images
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'text/xml',
  'text/html',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  // Audio
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/flac',
  'audio/m4a',
  'audio/x-wav',
  // Video
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  // Code files (text-based)
  'text/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-c++',
  'text/x-csharp',
  'text/x-php',
  'text/x-ruby',
  'text/x-go',
  'text/x-rust',
  'text/x-typescript',
  'text/x-javascript',
  'application/javascript',
  'application/x-javascript',
  'text/javascript',
]);

export function isMimeTypeSupported(mimeType: string, fileName?: string): boolean {
  const normalizedMime = mimeType ? mimeType.toLowerCase().trim() : '';
  if (SUPPORTED_MIME_TYPES.has(normalizedMime)) {
    return true;
  }
  // Some browsers do not set mimeType for code files (e.g. .py, .go, .rs, .ts).
  // We can fallback to checking extension for code files if mimeType is empty or generic.
  if (!normalizedMime || normalizedMime === 'application/octet-stream') {
    const ext = fileName?.split('.').pop()?.toLowerCase();
    if (ext) {
      const codeExtensions = new Set([
        'py', 'java', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'ts', 'js', 'json', 'sh', 'md', 'txt', 'csv', 'xml', 'html'
      ]);
      return codeExtensions.has(ext);
    }
  }
  return false;
}

export function getAcceptAttribute(): string {
  // Convert supported mime types to a comma separated string for HTML accept attribute
  // Add some common extensions just in case browsers don't match MIME types correctly
  const commonExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.zip', '.rar', '.7z', '.json'];
  return Array.from(SUPPORTED_MIME_TYPES).concat(commonExtensions).join(',');
}

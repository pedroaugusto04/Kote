export const TEXT_MIME_PREFIXES = ['text/'];

export const TEXT_MIME_EXACT = new Set([
  'application/json',
  'application/sql',
  'text/x-sql',
  'application/javascript',
  'application/x-javascript',
]);

export const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'json',
  'sql', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go',
  'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'sh', 'yaml', 'yml',
  'env', 'ini', 'conf', 'toml', 'jsonl',
]);

export const EXCLUDED_TEXT_MIMES = new Set([
  'text/html',
  'text/xml',
  'application/xml',
]);

export const EXCLUDED_TEXT_EXTENSIONS = new Set([
  'html',
  'htm',
  'xml',
  'log',
]);

export function isTextAttachment(mimeType: string, fileName?: string): boolean {
  const mime = (mimeType || '').toLowerCase().trim();
  const ext = fileName ? fileName.split('.').pop()?.toLowerCase() || '' : '';

  if (ext && EXCLUDED_TEXT_EXTENSIONS.has(ext)) return false;
  if (mime && EXCLUDED_TEXT_MIMES.has(mime)) return false;

  if (TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return true;
  if (TEXT_MIME_EXACT.has(mime)) return true;

  if (ext && TEXT_EXTENSIONS.has(ext)) return true;
  return false;
}

export function isPdfAttachment(mimeType: string, fileName?: string): boolean {
  const mime = (mimeType || '').toLowerCase().trim();
  if (mime === 'application/pdf') return true;
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return true;
  }
  return false;
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 512);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}



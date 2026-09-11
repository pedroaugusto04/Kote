import { isZipAttachmentMimeType } from '../constants/attachment.constants.js';

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_EMPTY_ARCHIVE_HEADER = 0x06054b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const ZIP_MAX_COMMENT_SIZE = 0xffff;

export function isZipFileName(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith('.zip');
}

export function decodeBase64(value: string): Buffer | null {
  const normalized = value.trim();
  if (!normalized) return Buffer.alloc(0);
  if (normalized.length % 4 !== 0) return null;

  const paddingLength = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  const contentLength = normalized.length - paddingLength;

  for (let index = 0; index < contentLength; index += 1) {
    const code = normalized.charCodeAt(index);
    const isUppercase = code >= 65 && code <= 90;
    const isLowercase = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (!isUppercase && !isLowercase && !isDigit && code !== 43 && code !== 47) return null;
  }

  for (let index = contentLength; index < normalized.length; index += 1) {
    if (normalized.charCodeAt(index) !== 61) return null;
  }

  return Buffer.from(normalized, 'base64');
}

/** Validates ZIP container headers without extracting any archive entry. */
export function isValidZipArchive(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const openingSignature = buffer.readUInt32LE(0);
  if (openingSignature !== ZIP_LOCAL_FILE_HEADER && openingSignature !== ZIP_EMPTY_ARCHIVE_HEADER) return false;

  const firstPossibleEocd = Math.max(0, buffer.length - ZIP_END_OF_CENTRAL_DIRECTORY_SIZE - ZIP_MAX_COMMENT_SIZE);
  for (let offset = buffer.length - ZIP_END_OF_CENTRAL_DIRECTORY_SIZE; offset >= firstPossibleEocd; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_EMPTY_ARCHIVE_HEADER) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + ZIP_END_OF_CENTRAL_DIRECTORY_SIZE + commentLength === buffer.length) return true;
  }
  return false;
}

export function isZipAttachment(fileName: string, mimeType: string): boolean {
  return isZipFileName(fileName) || isZipAttachmentMimeType(mimeType);
}

import { detectSensitiveData, redactSensitiveData } from '../utils/security/sensitive-data-redactor.js';

export interface SanitizedNoteContent {
  title: string;
  rawText: string;
  detectedPatterns: string[];
}

export function sanitizeManualNoteContent(
  title: string,
  rawText: string,
  originalTitle?: string,
): SanitizedNoteContent {
  const sanitizedTitle = redactSensitiveData(title);
  const sanitizedRawText = redactSensitiveData(rawText);

  const titlePatterns = detectSensitiveData(title);
  const contentPatterns = detectSensitiveData(rawText);
  const detectedPatterns = [...new Set([...titlePatterns, ...contentPatterns])];

  if (detectedPatterns.length > 0) {
    console.warn(
      `[SensitiveDataRedaction] Patterns detected and redacted in note "${originalTitle || title}": ${detectedPatterns.join(', ')}`
    );
  }

  return {
    title: sanitizedTitle,
    rawText: sanitizedRawText,
    detectedPatterns,
  };
}

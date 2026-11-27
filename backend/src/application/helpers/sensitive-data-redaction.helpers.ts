import { redactWithDetection } from '../utils/security/sensitive-data-redactor.js';

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
  const titleResult = redactWithDetection(title);
  const contentResult = redactWithDetection(rawText);
  const detectedPatterns = [...new Set([...titleResult.detected, ...contentResult.detected])];

  if (detectedPatterns.length > 0) {
    console.warn(
      `[SensitiveDataRedaction] Patterns detected and redacted in note "${originalTitle || title}": ${detectedPatterns.join(', ')}`
    );
  }

  return {
    title: titleResult.sanitized,
    rawText: contentResult.sanitized,
    detectedPatterns,
  };
}

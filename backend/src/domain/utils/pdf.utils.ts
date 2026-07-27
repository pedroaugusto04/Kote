/**
 * Safely extract plain text content from a PDF Buffer.
 * Returns empty string if the PDF is scanned (images only), encrypted, corrupt, or empty.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) return '';
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    const text = (parsed?.text || '').trim();
    return text.replace(/\0/g, '').replace(/\n{3,}/g, '\n\n');
  } catch (error) {
    // Log error for debugging
    console.error('PDF extraction error:', error);
    return '';
  }
}

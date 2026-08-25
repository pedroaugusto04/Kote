import type { ObjectStorage } from '../ports/notes/object-storage.js';
import type { AttachmentRecord } from '../models/repository-records.models.js';
import type { AppLogger } from '../../observability/logger.js';
import { isTextAttachment, isPdfAttachment, isBinaryBuffer } from '../../domain/utils/attachment.utils.js';
import { extractTextFromPdf } from '../../domain/utils/pdf.utils.js';

/**
 * Resolves attachment text content (from plain text or PDF files) via ObjectStorage.
 * Handles errors gracefully and logs diagnostic metrics cleanly.
 */
export async function resolveAttachmentTextContent(
  attachment: AttachmentRecord,
  objectStorage: ObjectStorage,
  logger: AppLogger,
  workerPrefix: string,
  noteId: string,
): Promise<string | undefined> {
  const isText = isTextAttachment(attachment.mimeType, attachment.fileName);
  const isPdf = isPdfAttachment(attachment.mimeType, attachment.fileName);

  if (!isText && !isPdf) {
    return undefined;
  }

  if (!attachment.storageKey) {
    logger.warn(`${workerPrefix}.attachment_missing_storage_key`, {
      noteId,
      fileName: attachment.fileName,
    });
    return undefined;
  }

  try {
    const raw = await objectStorage.get(attachment.storageKey);
    if (!raw || raw.length === 0) return undefined;

    if (isPdf) {
      const extracted = await extractTextFromPdf(raw);
      logger.info(`${workerPrefix}.attachment_pdf_extracted`, {
        noteId,
        fileName: attachment.fileName,
        contentChars: extracted?.length ?? 0,
      });
      return extracted || undefined;
    }

    if (!isBinaryBuffer(raw)) {
      const content = raw.toString('utf-8');
      logger.info(`${workerPrefix}.attachment_read`, {
        noteId,
        fileName: attachment.fileName,
        rawBytes: raw.length,
        contentChars: content.length,
      });
      return content;
    }
  } catch (err) {
    logger.warn(`${workerPrefix}.attachment_text_read_failed`, {
      noteId,
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      storageKey: attachment.storageKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return undefined;
}

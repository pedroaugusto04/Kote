import type { WhatsappAskAttachmentResolution } from '../../models/whatsapp-ask-attachment.models.js';
import { WhatsappMediaType } from '../../../contracts/enums.js';

export function normalizeReplyText(value: unknown): string {
  return String(value || '').trim() || 'I could not build the reply. Please try again.';
}

export function formatAskReply(
  resultOrAnswer: { answer?: string } | string | null | undefined,
  attachmentResolution?: WhatsappAskAttachmentResolution,
): string {
  const rawAnswer = typeof resultOrAnswer === 'object' && resultOrAnswer !== null
    ? resultOrAnswer.answer
    : resultOrAnswer;
  const lines = [
    String(rawAnswer || '').trim() || 'I could not build the answer. Please try again.',
    ...formatAskAttachmentNotices(attachmentResolution),
  ];
  return lines.filter(Boolean).join('\n');
}

export function formatAskAttachmentNotices(attachmentResolution?: WhatsappAskAttachmentResolution): string[] {
  if (!attachmentResolution?.requested) return [];
  const notices: string[] = [];
  if (attachmentResolution.noteCount > 0 && attachmentResolution.attachmentCount === 0) {
    notices.push('I could not find any attached files in the notes found.');
  }
  if (attachmentResolution.oversizedCount > 0) {
    notices.push(`I found ${attachmentResolution.oversizedCount} file(s) larger than 15 MB, which were not sent due to the size limit.`);
  }
  return notices;
}

export function mediaTypeFromMime(mimeType: string): WhatsappMediaType {
  if (mimeType.startsWith('image/')) return WhatsappMediaType.Image;
  if (mimeType.startsWith('video/')) return WhatsappMediaType.Video;
  if (mimeType.startsWith('audio/')) return WhatsappMediaType.Audio;
  return WhatsappMediaType.Document;
}

import type { WhatsappMediaType } from '../ports/integrations/whatsapp-reply.sender.js';

export type WhatsappAskAttachmentNoteRef = {
  id?: string;
  noteId?: string;
  workspaceId?: string;
};

export type WhatsappAskAttachmentMedia = {
  noteId: string;
  attachmentId: string;
  mediaType: WhatsappMediaType;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  mediaBase64: string;
};

export type WhatsappAskAttachmentResolution = {
  requested: boolean;
  noteCount: number;
  attachmentCount: number;
  media: WhatsappAskAttachmentMedia[];
  oversizedCount: number;
  missingContentCount: number;
};

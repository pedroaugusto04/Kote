import { Injectable } from '@nestjs/common';

import type {
  WhatsappAskAttachmentMedia,
  WhatsappAskAttachmentNoteRef,
  WhatsappAskAttachmentResolution,
} from '../../models/whatsapp-ask-attachment.models.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { ObjectStorage, ObjectStorageMissingContentError } from '../../ports/object-storage.js';
import type { WhatsappMediaType } from '../../ports/whatsapp-reply.sender.js';

const maxAttachmentsPerReply = 3;
const maxAttachmentBytes = 15 * 1024 * 1024;

const sendIntentPattern = /\b(send|share|return|attach|download|manda|mandar|mande|envia|enviar|envie|retorna|retornar|retorne|encaminha|encaminhar|anexa|anexar|passe|passa)\b/i;
const attachmentTermPattern = /\b(file|files|attachment|attachments|document|documents|pdf|image|images|photo|photos|media|audio|video|arquivo|arquivos|anexo|anexos|anexado|anexados|documento|documentos|imagem|imagens|foto|fotos|midia|m[ií]dia|áudio|audio|vídeo|video|planilha|docx|zip)\b/i;

@Injectable()
export class ResolveWhatsappAskAttachmentsUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(input: {
    userId: string;
    workspaceSlug: string;
    question: string;
    sources?: WhatsappAskAttachmentNoteRef[];
    relatedNotes?: WhatsappAskAttachmentNoteRef[];
  }): Promise<WhatsappAskAttachmentResolution> {
    if (!hasExplicitAttachmentRequest(input.question)) {
      return emptyResolution(false);
    }

    const noteIds = await this.orderedWorkspaceNoteIds(input.userId, input.workspaceSlug, [
      ...(input.sources || []),
      ...(input.relatedNotes || []),
    ]);
    let attachmentCount = 0;
    let oversizedCount = 0;
    let missingContentCount = 0;
    const media: WhatsappAskAttachmentMedia[] = [];

    for (const noteId of noteIds) {
      const attachments = await this.contentRepository.listAttachments(input.userId, noteId);
      attachmentCount += attachments.length;

      for (const attachment of attachments) {
        if (attachment.sizeBytes > maxAttachmentBytes) {
          oversizedCount += 1;
          continue;
        }
        if (media.length >= maxAttachmentsPerReply) continue;

        try {
          const body = await this.objectStorage.get(attachment.storageKey);
          media.push({
            noteId,
            attachmentId: attachment.id,
            mediaType: mediaTypeFromMime(attachment.mimeType),
            mimeType: attachment.mimeType || 'application/octet-stream',
            fileName: attachment.fileName || 'attachment',
            sizeBytes: attachment.sizeBytes,
            mediaBase64: body.toString('base64'),
          });
        } catch (error) {
          if (error instanceof ObjectStorageMissingContentError) {
            missingContentCount += 1;
            continue;
          }
          throw error;
        }
      }
    }

    return {
      requested: true,
      noteCount: noteIds.length,
      attachmentCount,
      media,
      oversizedCount,
      missingContentCount,
    };
  }

  private async orderedWorkspaceNoteIds(userId: string, workspaceSlug: string, refs: WhatsappAskAttachmentNoteRef[]) {
    const orderedIds = Array.from(new Set(refs.map(noteIdFromRef).filter((id): id is string => Boolean(id))));
    const allowedIds: string[] = [];
    for (const noteId of orderedIds) {
      const note = await this.contentRepository.getNoteById(userId, noteId);
      if (note?.workspaceSlug === workspaceSlug) allowedIds.push(noteId);
    }
    return allowedIds;
  }
}

function emptyResolution(requested: boolean): WhatsappAskAttachmentResolution {
  return {
    requested,
    noteCount: 0,
    attachmentCount: 0,
    media: [],
    oversizedCount: 0,
    missingContentCount: 0,
  };
}

function hasExplicitAttachmentRequest(question: string): boolean {
  const normalized = String(question || '').normalize('NFC');
  return sendIntentPattern.test(normalized) && attachmentTermPattern.test(normalized);
}

function noteIdFromRef(ref: WhatsappAskAttachmentNoteRef): string {
  return String(ref.noteId || ref.id || '').trim();
}

function mediaTypeFromMime(mimeType: string): WhatsappMediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

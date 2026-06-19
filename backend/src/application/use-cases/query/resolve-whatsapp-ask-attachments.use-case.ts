import { Injectable } from '@nestjs/common';

import type {
  WhatsappAskAttachmentMedia,
  WhatsappAskAttachmentNoteRef,
  WhatsappAskAttachmentResolution,
} from '../../models/whatsapp-ask-attachment.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ObjectStorage, ObjectStorageMissingContentError } from '../../ports/notes/object-storage.js';
import { WhatsappMediaType } from '../../ports/integrations/whatsapp-reply.sender.js';

const maxAttachmentsPerReply = 3;
const maxAttachmentBytes = 15 * 1024 * 1024;

@Injectable()
export class ResolveWhatsappAskAttachmentsUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(input: {
    userId: string;
    workspaceSlug: string;
    requestedAttachments: boolean;
    requestedAttachmentPattern?: string;
    sources?: WhatsappAskAttachmentNoteRef[];
    relatedNotes?: WhatsappAskAttachmentNoteRef[];
  }): Promise<WhatsappAskAttachmentResolution> {
    if (!input.requestedAttachments) {
      return emptyResolution(false);
    }

    const noteIds = await this.orderedWorkspaceNoteIds(
      input.userId,
      input.workspaceSlug,
      input.sources,
      input.relatedNotes,
    );

    // 1. Gather all attachments across the identified notes
    const allAttachments: Array<{ noteId: string; attachment: any }> = [];
    for (const noteId of noteIds) {
      const attachments = await this.contentRepository.listAttachments(input.userId, noteId);
      for (const attachment of attachments) {
        allAttachments.push({ noteId, attachment });
      }
    }

    // 2. Filter attachments if a pattern is requested by the user
    let attachmentsToSend = allAttachments;
    const pattern = input.requestedAttachmentPattern?.trim().toLowerCase();
    if (pattern) {
      const filtered = allAttachments.filter((item) =>
        (item.attachment.fileName || '').toLowerCase().includes(pattern)
      );
      // Fallback to all attachments only if the filtered subset is empty
      if (filtered.length > 0) {
        attachmentsToSend = filtered;
      }
    }

    let oversizedCount = 0;
    let missingContentCount = 0;
    const media: WhatsappAskAttachmentMedia[] = [];

    for (const { noteId, attachment } of attachmentsToSend) {
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

    return {
      requested: true,
      noteCount: noteIds.length,
      attachmentCount: allAttachments.length,
      media,
      oversizedCount,
      missingContentCount,
    };
  }

  private async orderedWorkspaceNoteIds(
    userId: string,
    workspaceSlug: string,
    sources: WhatsappAskAttachmentNoteRef[] = [],
    relatedNotes: WhatsappAskAttachmentNoteRef[] = [],
  ): Promise<string[]> {
    const workspaceNoteIds = new Set(
      relatedNotes
        .filter((n) => n.workspaceSlug === workspaceSlug)
        .map((n) => String(n.id || n.noteId || '').trim())
    );

    const nonWorkspaceNoteIds = new Set(
      relatedNotes
        .filter((n) => n.workspaceSlug && n.workspaceSlug !== workspaceSlug)
        .map((n) => String(n.id || n.noteId || '').trim())
    );

    const orderedIds = Array.from(
      new Set(
        [...sources, ...relatedNotes]
          .map((ref) => String(ref.noteId || ref.id || '').trim())
          .filter(Boolean)
      )
    );

    const allowedIds: string[] = [];
    for (const noteId of orderedIds) {
      if (workspaceNoteIds.has(noteId)) {
        allowedIds.push(noteId);
      } else if (!nonWorkspaceNoteIds.has(noteId)) {
        const note = await this.contentRepository.getNoteById(userId, noteId);
        if (note?.workspaceSlug === workspaceSlug) {
          allowedIds.push(noteId);
        }
      }
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

function mediaTypeFromMime(mimeType: string): WhatsappMediaType {
  if (mimeType.startsWith('image/')) return WhatsappMediaType.Image;
  if (mimeType.startsWith('video/')) return WhatsappMediaType.Video;
  if (mimeType.startsWith('audio/')) return WhatsappMediaType.Audio;
  return WhatsappMediaType.Document;
}

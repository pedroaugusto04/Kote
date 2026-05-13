import { Injectable } from '@nestjs/common';

import { ObjectStorage, ObjectStorageMissingContentError } from '../../ports/object-storage.js';
import { ContentRepository } from '../../ports/content.repository.js';

export type NoteAttachmentContent = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  body: Buffer;
};

@Injectable()
export class GetNoteAttachmentContentUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async execute(userId: string, noteId: string, attachmentId: string): Promise<NoteAttachmentContent | null> {
    const note = await this.contentRepository.getNoteById(userId, noteId);
    if (!note) return null;

    const attachment = (await this.contentRepository.listAttachments(userId, noteId)).find((item) => item.id === attachmentId);
    if (!attachment) return null;

    try {
      const body = await this.objectStorage.get(attachment.storageKey);
      return {
        fileName: attachment.fileName,
        mimeType: attachment.mimeType || 'application/octet-stream',
        sizeBytes: attachment.sizeBytes,
        body,
      };
    } catch (error) {
      if (error instanceof ObjectStorageMissingContentError) return null;
      throw error;
    }
  }
}

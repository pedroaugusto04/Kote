import { Injectable } from '@nestjs/common';
import { NoteNotFoundException } from '../../../domain/exceptions/index.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class SetNotePinnedUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, id: string, pinned: boolean) {
    const note = await this.contentRepository.getNoteById(userId, id);
    if (!note) throw new NoteNotFoundException();

    const updated = await this.contentRepository.setNotePinned(userId, id, pinned);
    return { ok: true as const, noteId: id, pinned: updated?.isPinned ?? pinned };
  }
}

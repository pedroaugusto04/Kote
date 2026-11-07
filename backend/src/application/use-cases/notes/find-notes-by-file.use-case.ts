import { Injectable } from '@nestjs/common';
import { NoteContextRepository } from '../../ports/notes/note-context.repository.js';
import { noteSummary } from '../../mappers/vault-note.mapper.js';

@Injectable()
export class FindNotesByFileUseCase {
  constructor(private readonly noteContextRepository: NoteContextRepository) {}

  async execute(userId: string, filePath: string, options?: { projectSlug?: string }) {
    const notes = await this.noteContextRepository.findNotesByFile(userId, filePath, {
      ...options,
      includeContent: false,
    });
    return notes.map((n) => noteSummary(n));
  }
}

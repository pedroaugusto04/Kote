import { Injectable } from '@nestjs/common';

import { buildNoteEditorState } from '../notes/note-editor.helpers.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class GetNoteDetailUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly contentRepository: ContentRepository,
  ) {}

  async execute(userId: string, id: string) {
    const note = await this.contentQueryRepository.getById(userId, id);
    if (!note) return null;
    const noteRecord = await this.contentRepository.getNoteById(userId, id);
    return {
      ...note,
      editor: noteRecord ? buildNoteEditorState(noteRecord) : null,
    };
  }
}

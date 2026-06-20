import { Injectable } from '@nestjs/common';

import { buildNoteEditorState } from '../notes/note-editor.helpers.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class GetNoteDetailUseCase {
  constructor(private readonly contentQueryRepository: ContentQueryRepository) {}

  async execute(userId: string, id: string) {
    const note = await this.contentQueryRepository.getById(userId, id);
    if (!note) return null;
    return {
      ...note,
      editor: buildNoteEditorState(note as any),
    };
  }
}

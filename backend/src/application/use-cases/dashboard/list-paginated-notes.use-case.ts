import { Injectable } from '@nestjs/common';

import type { ListNotesInput } from '../../models/note-list.models.js';
import { ContentRepository } from '../../ports/content.repository.js';

@Injectable()
export class ListPaginatedNotesUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  execute(userId: string, input: ListNotesInput) {
    return this.contentRepository.listNotesPage(userId, input);
  }
}

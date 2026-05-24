import { Injectable } from '@nestjs/common';

import type { ListProjectsInput } from '../../models/project-list.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class ListPaginatedProjectsUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  execute(userId: string, input: ListProjectsInput) {
    return this.contentRepository.listProjectsPage(userId, input);
  }
}

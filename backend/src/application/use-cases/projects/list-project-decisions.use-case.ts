import { Injectable } from '@nestjs/common';
import type { ListProjectDecisionsInput, ListProjectDecisionsResult } from '../../models/project-decisions.models.js';
import { NoteSynthesisRepository } from '../../ports/notes/note-synthesis.repository.js';

@Injectable()
export class ListProjectDecisionsUseCase {
  constructor(private readonly noteSynthesisRepository: NoteSynthesisRepository) {}

  async execute(userId: string, input: ListProjectDecisionsInput): Promise<ListProjectDecisionsResult> {
    return this.noteSynthesisRepository.listProjectDecisions(userId, input);
  }
}

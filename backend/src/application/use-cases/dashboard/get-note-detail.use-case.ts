import { Injectable } from '@nestjs/common';

import { ContentQueryRepository } from '../../ports/content.repository.js';

@Injectable()
export class GetNoteDetailUseCase {
  constructor(private readonly contentQueryRepository: ContentQueryRepository) {}

  async execute(userId: string, id: string) {
    return this.contentQueryRepository.getById(userId, id);
  }
}

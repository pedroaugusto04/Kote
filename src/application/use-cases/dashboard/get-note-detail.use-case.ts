import { Injectable } from '@nestjs/common';

import { ContentQueryRepository } from '../../ports/repositories.js';

@Injectable()
export class GetNoteDetailUseCase {
  constructor(private readonly contentQueryRepository: ContentQueryRepository) {}

  async execute(userId: string, id: string) {
    return this.contentQueryRepository.getById(userId, id);
  }
}

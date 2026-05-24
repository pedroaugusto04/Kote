import { Injectable } from '@nestjs/common';

import { ContentQueryRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class GetReviewDetailUseCase {
  constructor(private readonly contentQueryRepository: ContentQueryRepository) {}

  execute(userId: string, id: string) {
    return this.contentQueryRepository.getReviewById(userId, id);
  }
}

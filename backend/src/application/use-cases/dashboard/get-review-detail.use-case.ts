import { Injectable } from '@nestjs/common';

import { ContentQueryRepository } from '../../ports/content.repository.js';

@Injectable()
export class GetReviewDetailUseCase {
  constructor(private readonly contentQueryRepository: ContentQueryRepository) {}

  execute(userId: string, id: string) {
    return this.contentQueryRepository.getReviewById(userId, id);
  }
}

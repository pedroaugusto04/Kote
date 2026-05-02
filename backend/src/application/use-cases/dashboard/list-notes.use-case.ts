import { Injectable } from '@nestjs/common';
import { ContentQueryRepository } from '../../ports/content.repository.js';

@Injectable()
export class ListNotesUseCase {
  constructor(private readonly contentQueryRepository: ContentQueryRepository) {}

  async execute(userId: string) {
    return this.contentQueryRepository.list(userId);
  }
}

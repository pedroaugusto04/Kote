import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import type { ProductivityInsightsRaw } from '../../models/productivity.models.js';

@Injectable()
export class GetProductivityInsightsRawUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string): Promise<ProductivityInsightsRaw> {
    return this.contentRepository.getProductivityInsightsRaw(userId);
  }
}

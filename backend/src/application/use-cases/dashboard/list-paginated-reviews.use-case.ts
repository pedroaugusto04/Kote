import { Injectable } from '@nestjs/common';

import { buildPaginationMeta } from '../../../contracts/pagination.js';
import type { ListReviewsInput } from '../../models/review-list.models.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class ListPaginatedReviewsUseCase {
  constructor(private readonly contentQueryRepository: ContentQueryRepository) {}

  async execute(userId: string, input: ListReviewsInput) {
    const reviews = await this.contentQueryRepository.listReviews(userId);
    const selectedPage = resolveSelectedPage(reviews.map((review) => review.id), input.selectedId, input.page, input.pageSize);
    const pagination = buildPaginationMeta({ page: selectedPage, pageSize: input.pageSize }, reviews.length);
    const start = (pagination.page - 1) * pagination.pageSize;
    return { items: reviews.slice(start, start + pagination.pageSize), pagination };
  }
}

function resolveSelectedPage(ids: string[], selectedId: string | undefined, fallbackPage: number, pageSize: number) {
  if (!selectedId) return fallbackPage;
  const index = ids.indexOf(selectedId);
  return index >= 0 ? Math.floor(index / pageSize) + 1 : fallbackPage;
}

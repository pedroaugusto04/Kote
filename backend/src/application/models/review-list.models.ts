import type { PaginationMeta } from './pagination.models.js';
import type { ReviewView } from './review.models.js';

export type ListReviewsInput = {
  page: number;
  pageSize: number;
  selectedId?: string;
};

export type PaginatedReviews = {
  items: ReviewView[];
  pagination: PaginationMeta;
};

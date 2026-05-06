import type { PaginatedResponse } from './models/pagination';
import type { Review } from './models/review';
import { request } from './request';

export function fetchReviews(params: { page?: number; pageSize?: number; selectedId?: string }) {
  const search = new URLSearchParams({
    page: String(params.page || 1),
    pageSize: String(params.pageSize || 10),
    selectedId: params.selectedId || '',
  });
  return request<PaginatedResponse<Review, 'reviews'>>(`/api/reviews?${search.toString()}`);
}

export async function fetchReview(id: string) {
  const result = await request<{ ok: true; review: Review }>(`/api/reviews/${encodeURIComponent(id)}`);
  return result.review;
}

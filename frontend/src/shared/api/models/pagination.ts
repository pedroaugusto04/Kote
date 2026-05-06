export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type PaginatedResponse<T, K extends string = 'items'> = {
  ok: true;
  pagination: PaginationMeta;
} & Record<K, T[]>;

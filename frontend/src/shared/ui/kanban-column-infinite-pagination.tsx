import { useCallback, useEffect, useRef } from 'react';

export function KanbanColumnInfinitePagination<T extends string>({
  columnKey,
  pagination,
  isLoading,
  onPageChange,
}: {
  columnKey: T;
  pagination: { page?: number; totalPages?: number; hasNext?: boolean; total?: number; pageSize?: number };
  isLoading: boolean;
  onPageChange: (columnKey: T, page: number) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const currentPage = pagination.page ?? 1;
  const totalPages = pagination.totalPages ?? 1;
  const hasNext = pagination.hasNext ?? false;
  const total = pagination.total ?? 0;
  const pageSize = pagination.pageSize ?? 5;

  const requestNextPage = useCallback(() => {
    if (isLoading || !hasNext) return;
    onPageChange(columnKey, currentPage + 1);
  }, [isLoading, onPageChange, hasNext, currentPage, columnKey]);

  useEffect(() => {
    if (totalPages <= 1 || !hasNext) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          requestNextPage();
        }
      },
      { rootMargin: '100px', threshold: 0.1 }
    );

    const sentinel = sentinelRef.current;
    if (sentinel) observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [totalPages, hasNext, requestNextPage]);

  if (totalPages <= 1) return null;

  const loadedCount = Math.min(total, currentPage * pageSize);

  return (
    <div className="kanban-column-infinite-pagination" ref={sentinelRef} aria-live="polite">
      <span className="kanban-column-infinite-pagination-summary">
        {hasNext ? `${loadedCount} of ${total}` : `All ${total} loaded`}
      </span>
      {hasNext ? (
        <button
          className="icon-button mobile-infinite-pagination-button"
          disabled={isLoading}
          type="button"
          onClick={requestNextPage}
          style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
        >
          {isLoading ? 'Loading...' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}

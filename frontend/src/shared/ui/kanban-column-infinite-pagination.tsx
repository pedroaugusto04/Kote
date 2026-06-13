import { useCallback, useEffect, useMemo, useRef } from 'react';

type IdentifiableItem = {
  id: string;
};

/**
 * Accumulates items across pages for a single Kanban column.
 * Uses a simple ref-based page cache and a memo to derive the merged list.
 * No useState inside — avoids double-render loops from effect-driven state.
 */
export function useKanbanColumnPaginatedItems<T extends IdentifiableItem>({
  items,
  pagination,
  resetKey,
  isPlaceholderData = false,
}: {
  items: T[];
  pagination?: { page?: number };
  resetKey: string;
  isPlaceholderData?: boolean;
}) {
  const currentPage = pagination?.page ?? 1;
  const pagesRef = useRef<Record<number, T[]>>({});
  const resetKeyRef = useRef(resetKey);
  const processedPageRef = useRef(0);

  // Reset cache when filters change
  if (resetKeyRef.current !== resetKey) {
    resetKeyRef.current = resetKey;
    pagesRef.current = {};
    processedPageRef.current = 0;
  }

  // Store new page data (skip placeholder renders)
  if (!isPlaceholderData && items.length > 0) {
    pagesRef.current[currentPage] = items;
    processedPageRef.current = currentPage;
  } else if (!isPlaceholderData && currentPage === 1) {
    pagesRef.current = { 1: items };
    processedPageRef.current = 1;
  }

  const visibleItems = useMemo(() => {
    const seen = new Set<string>();
    const merged: T[] = [];
    const maxPage = processedPageRef.current || currentPage;
    for (let p = 1; p <= maxPage; p++) {
      for (const item of pagesRef.current[p] || []) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }
    }
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, currentPage, isPlaceholderData, resetKey]);

  return { visibleItems };
}

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

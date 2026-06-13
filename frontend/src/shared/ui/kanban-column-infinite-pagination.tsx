import { useCallback, useEffect, useRef, useState } from 'react';

type IdentifiableItem = {
  id: string;
};

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
  const [columnItems, setColumnItems] = useState<T[]>(items);
  const [loadedPage, setLoadedPage] = useState(currentPage);
  const pageItemsRef = useRef<Record<number, T[]>>({});
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      pageItemsRef.current = {};
      setLoadedPage(0);
      setColumnItems(items);
    }

    if (isPlaceholderData || !pagination) return;

    if (currentPage <= 1) {
      pageItemsRef.current = { 1: items };
      setColumnItems(items);
      setLoadedPage(1);
      return;
    }

    pageItemsRef.current = {
      ...pageItemsRef.current,
      [currentPage]: items,
    };
    setColumnItems(mergePageItems(pageItemsRef.current, currentPage));
    setLoadedPage(currentPage);
  }, [isPlaceholderData, items, loadedPage, pagination, resetKey, currentPage]);

  return {
    loadedPage,
    visibleItems: columnItems,
  };
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
  const requestedPageRef = useRef<number | null>(null);

  const currentPage = pagination.page ?? 1;
  const totalPages = pagination.totalPages ?? 1;
  const hasNext = pagination.hasNext ?? false;
  const total = pagination.total ?? 0;
  const pageSize = pagination.pageSize ?? 5;

  useEffect(() => {
    requestedPageRef.current = null;
  }, [currentPage]);

  const requestNextPage = useCallback(() => {
    if (isLoading || !hasNext) return;

    const nextPage = currentPage + 1;
    if (requestedPageRef.current === nextPage) return;

    requestedPageRef.current = nextPage;
    onPageChange(columnKey, nextPage);
  }, [isLoading, onPageChange, hasNext, currentPage, columnKey]);

  useEffect(() => {
    if (totalPages <= 1) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          requestNextPage();
        }
      },
      { rootMargin: '100px', threshold: 0.1 }
    );

    const sentinel = sentinelRef.current;
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) observer.unobserve(sentinel);
      observer.disconnect();
    };
  }, [totalPages, requestNextPage]);

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

function mergePageItems<T extends IdentifiableItem>(pages: Record<number, T[]>, maxPage: number) {
  const seenIds = new Set<string>();
  const merged: T[] = [];

  for (let page = 1; page <= maxPage; page += 1) {
    for (const item of pages[page] || []) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}

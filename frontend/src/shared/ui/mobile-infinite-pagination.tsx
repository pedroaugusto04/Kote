import { useCallback, useEffect, useRef, useState } from 'react';

import type { PaginationMeta } from '../api/models/pagination';
import { useMediaQuery } from './use-media-query';

const MOBILE_PAGINATION_QUERY = '(max-width: 860px)';
const MOBILE_SCROLL_THRESHOLD_PX = 360;
const MOBILE_SCROLL_THROTTLE_MS = 260;

type IdentifiableItem = {
  id: string;
};

export function useMobilePaginatedItems<T extends IdentifiableItem>({
  items,
  pagination,
  resetKey,
  isPlaceholderData = false,
}: {
  items: T[];
  pagination?: PaginationMeta;
  resetKey: string;
  isPlaceholderData?: boolean;
}) {
  const isMobilePagination = useMediaQuery(MOBILE_PAGINATION_QUERY);
  const [mobileItems, setMobileItems] = useState<T[]>(items);
  const [loadedMobilePage, setLoadedMobilePage] = useState(pagination?.page || 0);
  const pageItemsRef = useRef<Record<number, T[]>>({});
  const resetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      pageItemsRef.current = {};
      setLoadedMobilePage(0);
      setMobileItems(items);
    }

    if (!isMobilePagination) {
      setLoadedMobilePage(pagination?.page || 0);
      setMobileItems(items);
      return;
    }

    if (!pagination || isPlaceholderData) return;

    if (pagination.page <= 1) {
      pageItemsRef.current = { ...pageItemsRef.current, 1: items };
      const highestPage = Math.max(loadedMobilePage, pagination.page);
      setMobileItems(mergePageItems(pageItemsRef.current, highestPage));
      setLoadedMobilePage(highestPage);
      return;
    }

    pageItemsRef.current = {
      ...pageItemsRef.current,
      [pagination.page]: items,
    };
    setMobileItems(mergePageItems(pageItemsRef.current, pagination.page));
    setLoadedMobilePage(pagination.page);
  }, [isMobilePagination, isPlaceholderData, items, loadedMobilePage, pagination, resetKey]);

  return {
    isMobilePagination,
    loadedMobilePage,
    visibleItems: isMobilePagination ? mobileItems : items,
  };
}

export function MobileInfinitePagination({
  pagination,
  isLoading,
  onPageChange,
}: {
  pagination: PaginationMeta;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}) {
  const isMobilePagination = useMediaQuery(MOBILE_PAGINATION_QUERY);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestedPageRef = useRef<number | null>(null);

  useEffect(() => {
    requestedPageRef.current = null;
  }, [pagination.page]);

  const requestNextPage = useCallback(() => {
    if (isLoading || !pagination.hasNext) return;

    const nextPage = pagination.page + 1;
    if (requestedPageRef.current === nextPage) return;

    requestedPageRef.current = nextPage;
    onPageChange(nextPage);
  }, [isLoading, onPageChange, pagination.hasNext, pagination.page]);

  useEffect(() => {
    if (!isMobilePagination || pagination.totalPages <= 1) return undefined;

    let lastRun = 0;
    let timeoutId: number | undefined;

    const runCheck = () => {
      lastRun = Date.now();
      timeoutId = undefined;

      const sentinel = sentinelRef.current;
      if (!sentinel) return;

      const rect = sentinel.getBoundingClientRect();
      if (rect.top <= window.innerHeight + MOBILE_SCROLL_THRESHOLD_PX) {
        requestNextPage();
      }
    };

    const throttledCheck = () => {
      const remaining = MOBILE_SCROLL_THROTTLE_MS - (Date.now() - lastRun);
      if (remaining <= 0) {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        runCheck();
        return;
      }

      if (timeoutId === undefined) {
        timeoutId = window.setTimeout(runCheck, remaining);
      }
    };

    const frameId = window.requestAnimationFrame(throttledCheck);
    window.addEventListener('scroll', throttledCheck, { passive: true });
    window.addEventListener('resize', throttledCheck);

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      window.removeEventListener('scroll', throttledCheck);
      window.removeEventListener('resize', throttledCheck);
    };
  }, [isMobilePagination, pagination.totalPages, requestNextPage]);

  if (!isMobilePagination || pagination.totalPages <= 1) return null;

  const loadedCount = Math.min(pagination.total, pagination.page * pagination.pageSize);

  return (
    <div className="mobile-infinite-pagination" ref={sentinelRef} aria-live="polite">
      <span className="mobile-infinite-pagination-summary">
        {pagination.hasNext ? `${loadedCount} of ${pagination.total}` : `All ${pagination.total} loaded`}
      </span>
      {pagination.hasNext ? (
        <button className="icon-button mobile-infinite-pagination-button" disabled={isLoading} type="button" onClick={requestNextPage}>
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

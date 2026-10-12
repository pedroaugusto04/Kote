import { useState } from 'react';

export function usePaginationState(resetKey: string, initialPage = 1) {
  const [prevKey, setPrevKey] = useState(resetKey);
  const [prevInitialPage, setPrevInitialPage] = useState(initialPage);
  const [page, setPage] = useState(initialPage);

  if (prevKey !== resetKey || prevInitialPage !== initialPage) {
    setPrevKey(resetKey);
    setPrevInitialPage(initialPage);
    setPage(initialPage);
  }

  return { page, setPage };
}

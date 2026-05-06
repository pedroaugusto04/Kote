import { useEffect, useState } from 'react';

export function usePaginationState(resetKey: string, initialPage = 1) {
  const [page, setPage] = useState(initialPage);

  useEffect(() => {
    setPage(initialPage);
  }, [initialPage, resetKey]);

  return { page, setPage };
}

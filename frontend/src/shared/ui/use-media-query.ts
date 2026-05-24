import { useEffect, useState } from 'react';

export function useMediaQuery(query: string, initialValue = false) {
  const [matches, setMatches] = useState(initialValue);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setMatches(initialValue);
      return undefined;
    }

    const mediaQuery = window.matchMedia(query);
    const syncMatches = () => setMatches(mediaQuery.matches);

    syncMatches();
    mediaQuery.addEventListener('change', syncMatches);

    return () => {
      mediaQuery.removeEventListener('change', syncMatches);
    };
  }, [initialValue, query]);

  return matches;
}

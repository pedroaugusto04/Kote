import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string, initialValue = false) {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener('change', onStoreChange);
      return () => mediaQuery.removeEventListener('change', onStoreChange);
    },
    () => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return initialValue;
      }
      return window.matchMedia(query).matches;
    },
    () => initialValue
  );
}

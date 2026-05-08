import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { GlobalLoadingOverlay } from '../shared/ui/GlobalLoadingOverlay';

type GlobalLoadingContextValue = {
  isActive: boolean;
  start: () => void;
  stop: () => void;
  trackPromise: <T>(promise: Promise<T>) => Promise<T>;
};

type GlobalLoadingProviderProps = {
  children: ReactNode;
  minVisibleMs?: number;
  showDelayMs?: number;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(null);

export function GlobalLoadingProvider({
  children,
  minVisibleMs = 200,
  showDelayMs = 120,
}: GlobalLoadingProviderProps) {
  const [visible, setVisible] = useState(false);
  const activeCountRef = useRef(0);
  const visibleRef = useRef(false);
  const visibleSinceRef = useRef<number | null>(null);
  const showTimeoutRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  const clearShowTimeout = useCallback(() => {
    if (showTimeoutRef.current !== null) {
      window.clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
  }, []);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const commitVisible = useCallback(() => {
    clearShowTimeout();
    clearHideTimeout();
    visibleSinceRef.current = Date.now();
    visibleRef.current = true;
    setVisible(true);
  }, [clearHideTimeout, clearShowTimeout]);

  const start = useCallback(() => {
    activeCountRef.current += 1;
    clearHideTimeout();

    if (visibleRef.current || showTimeoutRef.current !== null) {
      return;
    }

    if (showDelayMs <= 0) {
      commitVisible();
      return;
    }

    showTimeoutRef.current = window.setTimeout(() => {
      showTimeoutRef.current = null;
      if (activeCountRef.current > 0) {
        commitVisible();
      }
    }, showDelayMs);
  }, [clearHideTimeout, commitVisible, showDelayMs]);

  const stop = useCallback(() => {
    activeCountRef.current = Math.max(0, activeCountRef.current - 1);
    if (activeCountRef.current > 0) {
      return;
    }

    clearShowTimeout();

    if (!visibleRef.current) {
      return;
    }

    const visibleSince = visibleSinceRef.current;
    const elapsed = visibleSince === null ? minVisibleMs : Date.now() - visibleSince;
    const remaining = Math.max(0, minVisibleMs - elapsed);

    clearHideTimeout();
    hideTimeoutRef.current = window.setTimeout(() => {
      hideTimeoutRef.current = null;
      visibleSinceRef.current = null;
      visibleRef.current = false;
      setVisible(false);
    }, remaining);
  }, [clearHideTimeout, clearShowTimeout, minVisibleMs]);

  const trackPromise = useCallback(async <T,>(promise: Promise<T>) => {
    start();
    try {
      return await promise;
    } finally {
      stop();
    }
  }, [start, stop]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [visible]);

  useEffect(() => () => {
    clearShowTimeout();
    clearHideTimeout();
  }, [clearHideTimeout, clearShowTimeout]);

  const value = useMemo<GlobalLoadingContextValue>(() => ({
    isActive: visible,
    start,
    stop,
    trackPromise,
  }), [start, stop, trackPromise, visible]);

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
      {visible ? <GlobalLoadingOverlay /> : null}
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext);
  if (!context) {
    throw new Error('useGlobalLoading must be used within GlobalLoadingProvider.');
  }
  return context;
}

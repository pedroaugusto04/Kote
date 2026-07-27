import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { GlobalLoadingOverlay } from '../shared/ui/GlobalLoadingOverlay';
import { BackgroundTaskToast } from '../shared/ui/BackgroundTaskToast';

export type BackgroundTask = {
  /** Short label shown in the toast, e.g. "Importing commits" */
  label: string;
  /** Items processed so far */
  count: number;
  /** Total items to process */
  total: number;
  /** Optional handler to trigger cancel */
  onCancel?: () => void;
};

type GlobalLoadingContextValue = {
  isActive: boolean;
  start: () => void;
  startImmediate: () => void;
  stop: () => void;
  trackPromise: <T>(promise: Promise<T>) => Promise<T>;
  message: string | null;
  setMessage: (message: string | null) => void;
  /** Sets a background task indicator (small toast, no overlay). Pass null to clear. */
  setBackgroundTask: (task: BackgroundTask | null) => void;
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
  const [message, setMessage] = useState<string | null>(null);
  const [backgroundTask, setBackgroundTask] = useState<BackgroundTask | null>(null);
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

  const begin = useCallback((immediate: boolean) => {
    activeCountRef.current += 1;
    clearHideTimeout();

    if (visibleRef.current) {
      return;
    }

    if (immediate) {
      commitVisible();
      return;
    }

    if (showTimeoutRef.current !== null) {
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

  const start = useCallback(() => {
    begin(false);
  }, [begin]);

  const startImmediate = useCallback(() => {
    begin(true);
  }, [begin]);

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
    startImmediate,
    stop,
    trackPromise,
    message,
    setMessage,
    setBackgroundTask,
  }), [start, startImmediate, stop, trackPromise, visible, message, setBackgroundTask]);

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
      {visible ? <GlobalLoadingOverlay message={message} /> : null}
      {backgroundTask ? <BackgroundTaskToast task={backgroundTask} /> : null}
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

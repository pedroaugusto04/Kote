import { useEffect, useState } from 'react';

type UseMobileSwipeOptions = {
  enabled?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
};

export function useMobileSwipe({ enabled = true, onNext, onPrev }: UseMobileSwipeOptions) {
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let tracking = false;
    let lastNavigationAt = 0;
    let navigatedDuringGesture = false;

    const isInteractiveElement = (el: EventTarget | null) => {
      try {
        const node = el as HTMLElement | null;
        if (!node) return false;
        const tag = node.tagName?.toLowerCase();
        if (!tag) return false;
        if (['input', 'textarea', 'select', 'button', 'a'].includes(tag)) return true;
        if (node.closest && node.closest('button, a, input, textarea, select')) return true;
        return false;
      } catch (err) {
        return false;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      if (isInteractiveElement(e.target)) return;
      tracking = true;
      navigatedDuringGesture = false;
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      const touchX = e.changedTouches[0].screenX;
      const touchY = e.changedTouches[0].screenY;
      const deltaX = touchStartX - touchX;
      const deltaY = touchStartY - touchY;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        try { e.preventDefault(); } catch (err) { /* ignore */ }
        if (deltaX > 20) setSwipeDirection('left');
        else if (deltaX < -20) setSwipeDirection('right');
        else setSwipeDirection(null);

        const SWIPE_THRESHOLD = 30;
        const now = Date.now();
        if (Math.abs(deltaX) > SWIPE_THRESHOLD && now - lastNavigationAt >= 400 && !navigatedDuringGesture) {
          navigatedDuringGesture = true;
          lastNavigationAt = now;
          tracking = false;
          if (deltaX > 0 && onNext) {
            onNext();
            setTimeout(() => setSwipeDirection(null), 150);
          } else if (deltaX < 0 && onPrev) {
            onPrev();
            setTimeout(() => setSwipeDirection(null), 150);
          }
        }
      } else {
        setSwipeDirection(null);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      if (!e.changedTouches || e.changedTouches.length === 0) return;

      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const deltaX = touchStartX - touchEndX;
      const deltaY = touchStartY - touchEndY;

      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        setSwipeDirection(null);
        return;
      }

      const now = Date.now();
      if (now - lastNavigationAt < 400) {
        setSwipeDirection(null);
        return;
      }

      const SWIPE_THRESHOLD = 30;
      const clearHint = () => setTimeout(() => setSwipeDirection(null), 150);

      if (deltaX > SWIPE_THRESHOLD && onNext) {
        lastNavigationAt = now;
        onNext();
        clearHint();
      } else if (deltaX < -SWIPE_THRESHOLD && onPrev) {
        lastNavigationAt = now;
        onPrev();
        clearHint();
      } else {
        setSwipeDirection(null);
      }
    };

    const root: EventTarget = document.documentElement || document.body || window;
    root.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true, capture: true } as AddEventListenerOptions);
    root.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false, capture: true } as AddEventListenerOptions);
    root.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true, capture: true } as AddEventListenerOptions);

    return () => {
      try {
        root.removeEventListener('touchstart', handleTouchStart as EventListener, { capture: true } as EventListenerOptions);
        root.removeEventListener('touchmove', handleTouchMove as EventListener, { capture: true } as EventListenerOptions);
        root.removeEventListener('touchend', handleTouchEnd as EventListener, { capture: true } as EventListenerOptions);
      } catch (err) {
        window.removeEventListener('touchstart', handleTouchStart as EventListener);
        window.removeEventListener('touchmove', handleTouchMove as EventListener);
        window.removeEventListener('touchend', handleTouchEnd as EventListener);
      }
    };
  }, [enabled, onNext, onPrev]);

  return { swipeDirection } as const;
}

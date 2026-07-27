import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { InfoIcon } from './icons';

type InfoTooltipProps = {
  content: string | React.ReactNode;
  className?: string;
  iconClassName?: string;
};

export function InfoTooltip({ content, className = '', iconClassName = '' }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsVisible(false);
      }
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsVisible(false);
    }

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKey);
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      updatePosition();
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return setCoords(null);
    const rect = trigger.getBoundingClientRect();
    // place tooltip above the trigger by default
    const left = rect.left + rect.width / 2;
    const top = rect.top - 8; // small gap
    setCoords({ left, top });
  }

  const tooltip = isVisible ? (
    <div
      ref={tooltipRef}
      className={`info-tooltip-content ${className}`}
      role="tooltip"
      style={coords ? { position: 'fixed', left: coords.left, top: coords.top, transform: 'translate(-50%, -100%)' } as React.CSSProperties : undefined}
    >
      {content}
    </div>
  ) : null;

  return (
    <div className={`info-tooltip-wrapper ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="info-tooltip-trigger"
        onClick={() => setIsVisible((v) => !v)}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        aria-label="More information"
      >
        <InfoIcon className={`info-tooltip-icon ${iconClassName}`} />
      </button>
      {tooltip ? createPortal(tooltip, document.body) : null}
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { NoteSummary } from '../../shared/api/models/note';
import { formatCostComparison, formatModelRate } from '../../shared/utils/format';

export function getAiProviderTheme(providerOrModel?: string, source?: string | null) {
  const norm = `${providerOrModel || ''} ${source || ''}`.toLowerCase();
  if (norm.includes('codex') || norm.includes('openai') || norm.includes('gpt') || norm.includes('o1') || norm.includes('o3') || norm.includes('o4')) {
    return {
      tagClass: 'ai-codex',
      accentColor: 'var(--green, #10a37f)',
      borderAccent: 'rgba(16, 163, 127, 0.3)',
      badgeBg: 'rgba(16, 163, 127, 0.18)',
    };
  }
  if (norm.includes('claude') || norm.includes('anthropic') || norm.includes('sonnet') || norm.includes('haiku') || norm.includes('opus')) {
    return {
      tagClass: 'ai-claude',
      accentColor: 'var(--orange, #fb923c)',
      borderAccent: 'rgba(251, 146, 60, 0.3)',
      badgeBg: 'rgba(251, 146, 60, 0.18)',
    };
  }
  if (norm.includes('opencode') || norm.includes('open-code') || norm.includes('deepseek') || norm.includes('qwen')) {
    return {
      tagClass: 'ai-opencode',
      accentColor: 'var(--cyan, #60a5fa)',
      borderAccent: 'rgba(96, 165, 250, 0.3)',
      badgeBg: 'rgba(96, 165, 250, 0.18)',
    };
  }
  // Default / Antigravity / Gemini
  return {
    tagClass: 'ai-antigravity',
    accentColor: 'var(--purple, #c084fc)',
    borderAccent: 'rgba(192, 132, 252, 0.3)',
    badgeBg: 'rgba(192, 132, 252, 0.18)',
  };
}

export function AiUsagePill({ usage, source }: { usage?: NoteSummary['aiUsage']; source?: string | null }) {
  if (!usage || !usage.totalTokens) return null;

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverCoords, setPopoverCoords] = useState<{ left: number; top: number } | null>(null);

  const theme = getAiProviderTheme(usage.provider || usage.model, source);
  const hasMultipleModels = Array.isArray(usage.byModel) && usage.byModel.length > 1;

  const costFormatted = typeof usage.estimatedCostUsd === 'number'
    ? `$${usage.estimatedCostUsd.toFixed(4)}`
    : null;

  const comparisonFormatted = formatCostComparison(usage.estimatedCostUsd, usage.totalTokens, usage.rates);
  const tokensFormatted = usage.totalTokens.toLocaleString();

  let displayModelName = usage.model.split('/').pop() || usage.model;
  const additionalCount = hasMultipleModels && usage.byModel ? usage.byModel.length - 1 : 0;
  if (hasMultipleModels) {
    displayModelName = `${displayModelName} (+${additionalCount})`;
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        pillRef.current &&
        !pillRef.current.contains(event.target as Node)
      ) {
        setIsPopoverOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsPopoverOpen(false);
    }

    if (isPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', updatePopoverPosition);
      window.addEventListener('scroll', updatePopoverPosition, true);
      updatePopoverPosition();
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [isPopoverOpen]);

  function updatePopoverPosition() {
    const trigger = pillRef.current;
    if (!trigger) return setPopoverCoords(null);
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const popoverWidth = Math.min(360, Math.max(280, viewportWidth - 32));
    const left = Math.max(16, Math.min(viewportWidth - popoverWidth - 16, rect.left));
    const top = rect.bottom + 6;
    setPopoverCoords({ left, top });
  }

  let tooltip = '';
  if (hasMultipleModels && usage.byModel) {
    const lines = usage.byModel.map(
      (m) =>
        `• ${m.model}: ${m.totalTokens.toLocaleString()} tok ($${m.estimatedCostUsd.toFixed(4)})${m.cachedTokens ? ` [${m.cachedTokens.toLocaleString()} cached]` : ''}`
    );
    tooltip = [
      'Multi-Model Session Breakdown:',
      ...lines,
      `───────────────`,
      `Total: ${tokensFormatted} tok • ${costFormatted || '$0.0000'}`,
    ].join('\n');
  } else {
    tooltip = [
      `Model: ${usage.model}`,
      `Input: ${usage.inputTokens?.toLocaleString() || 0}`,
      `Output: ${usage.outputTokens?.toLocaleString() || 0}`,
      usage.reasoningTokens ? `Reasoning: ${usage.reasoningTokens.toLocaleString()}` : null,
      usage.cachedTokens ? `Cached: ${usage.cachedTokens.toLocaleString()}` : null,
      costFormatted ? `Estimated Cost: ${costFormatted}${comparisonFormatted ? ` (${comparisonFormatted})` : ''}` : null,
    ].filter(Boolean).join(' • ');
  }

  const popover = isPopoverOpen && hasMultipleModels && usage.byModel ? (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Multi-Model Usage Breakdown"
      style={{
        position: 'fixed',
        left: popoverCoords?.left ?? 16,
        top: popoverCoords?.top ?? 0,
        zIndex: 9999,
        minWidth: '280px',
        maxWidth: 'calc(100vw - 32px)',
        boxSizing: 'border-box',
        padding: '12px 14px',
        fontSize: '12px',
        borderRadius: '8px',
        boxShadow: 'var(--modal-shadow, 0 16px 40px rgba(0, 0, 0, 0.35))',
        border: `1px solid ${theme.borderAccent}`,
        background: 'var(--panel, #0f171d)',
        color: 'var(--text, #d8e2ea)',
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--line-soft, rgba(148, 163, 184, 0.16))' }}>
        <span style={{ fontWeight: 600, color: theme.accentColor, display: 'flex', alignItems: 'center', gap: '5px' }}>
          Multi-Model Usage Breakdown
        </span>
        <button
          type="button"
          onClick={() => setIsPopoverOpen(false)}
          style={{ background: 'none', border: 'none', color: 'var(--muted, #8da0ae)', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
        {usage.byModel.map((item) => {
          const itemCost = `$${item.estimatedCostUsd.toFixed(4)}`;
          const itemPercent = usage.totalTokens > 0 ? Math.round((item.totalTokens / usage.totalTokens) * 100) : 0;
          const rateStr = formatModelRate(item.rates);
          const itemTheme = getAiProviderTheme(item.provider || item.model, source);
          return (
            <div key={item.model} style={{ padding: '6px 8px', borderRadius: '6px', background: 'var(--surface-hover, rgba(148, 163, 184, 0.08))', border: '1px solid var(--border-subtle, rgba(148, 163, 184, 0.12))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontWeight: 600 }}>
                <span style={{ color: 'var(--text, inherit)' }}>{item.model}</span>
                <span style={{ color: itemTheme.accentColor }}>{itemCost}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted, #8da0ae)', marginTop: '2px' }}>
                <span>{item.totalTokens.toLocaleString()} tok ({itemPercent}%)</span>
                {item.cachedTokens ? <span>{item.cachedTokens.toLocaleString()} cached</span> : null}
              </div>
              {rateStr && (
                <div style={{ fontSize: '10px', color: 'var(--faint, #7a8f9e)', marginTop: '2px' }}>
                  ref: {rateStr}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ paddingTop: '8px', borderTop: '1px solid var(--line-soft, rgba(148, 163, 184, 0.16))', display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '11px', color: 'var(--text-soft, inherit)' }}>
        <span>Total: {tokensFormatted} tok</span>
        <span>{costFormatted || '$0.0000'}</span>
      </div>
    </div>
  ) : null;

  return (
    <>
      <span
        ref={pillRef}
        className={`source-tag ${theme.tagClass}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 8px',
          fontSize: '11px',
          borderRadius: '6px',
          cursor: hasMultipleModels ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        title={tooltip}
        onClick={hasMultipleModels ? () => setIsPopoverOpen((v) => !v) : undefined}
      >
        <span style={{ fontWeight: 600 }}>{displayModelName}</span>
        <span style={{ opacity: 0.6 }}>•</span>
        <span>{tokensFormatted} tok</span>
        {costFormatted && (
          <>
            <span style={{ opacity: 0.6 }}>•</span>
            <span style={{ fontWeight: 600 }}>{costFormatted}</span>
            {!hasMultipleModels && comparisonFormatted && (
              <span style={{ opacity: 0.75, fontSize: '10px' }}>({comparisonFormatted})</span>
            )}
          </>
        )}
        {hasMultipleModels && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '2px',
              padding: '1px 5px',
              borderRadius: '4px',
              background: theme.badgeBg,
              fontSize: '10px',
              fontWeight: 700,
            }}
            title="Clique para ver detalhamento dos modelos"
          >
            ℹ
          </span>
        )}
      </span>
      {popover && typeof document !== 'undefined' ? createPortal(popover, document.body) : null}
    </>
  );
}

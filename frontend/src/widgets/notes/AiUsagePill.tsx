import React from 'react';
import type { NoteSummary } from '../../shared/api/models/note';

export function AiUsagePill({ usage }: { usage?: NoteSummary['aiUsage'] }) {
  if (!usage || !usage.totalTokens) return null;

  const costFormatted = typeof usage.estimatedCostUsd === 'number'
    ? `$${usage.estimatedCostUsd.toFixed(4)}`
    : null;

  const tokensFormatted = usage.totalTokens.toLocaleString();

  const tooltip = [
    `Model: ${usage.model}`,
    `Input: ${usage.inputTokens?.toLocaleString() || 0}`,
    `Output: ${usage.outputTokens?.toLocaleString() || 0}`,
    usage.reasoningTokens ? `Reasoning: ${usage.reasoningTokens.toLocaleString()}` : null,
    usage.cachedTokens ? `Cached: ${usage.cachedTokens.toLocaleString()}` : null,
    costFormatted ? `Estimated Cost: ${costFormatted}` : null,
  ].filter(Boolean).join(' • ');

  return (
    <span
      className="source-tag ai"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        fontSize: '11px',
        borderRadius: '6px',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        background: 'rgba(139, 92, 246, 0.08)',
        color: '#a78bfa',
      }}
      title={tooltip}
    >
      <span style={{ fontSize: '12px' }}>⚡</span>
      <span style={{ fontWeight: 600 }}>{usage.model}</span>
      <span style={{ opacity: 0.6 }}>•</span>
      <span>{tokensFormatted} tok</span>
      {costFormatted && (
        <>
          <span style={{ opacity: 0.6 }}>•</span>
          <span style={{ fontWeight: 600 }}>{costFormatted}</span>
        </>
      )}
    </span>
  );
}

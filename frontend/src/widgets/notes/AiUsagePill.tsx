import React from 'react';
import type { NoteSummary } from '../../shared/api/models/note';
import { formatCostComparison } from '../../shared/utils/format';

export function AiUsagePill({ usage }: { usage?: NoteSummary['aiUsage'] }) {
  if (!usage || !usage.totalTokens) return null;

  const hasMultipleModels = Array.isArray(usage.byModel) && usage.byModel.length > 1;

  const costFormatted = typeof usage.estimatedCostUsd === 'number'
    ? `$${usage.estimatedCostUsd.toFixed(4)}`
    : null;

  const comparisonFormatted = formatCostComparison(usage.estimatedCostUsd, usage.totalTokens, usage.rates);
  const tokensFormatted = usage.totalTokens.toLocaleString();

  let displayModelName = usage.model.split('/').pop() || usage.model;
  if (hasMultipleModels && usage.byModel) {
    const additionalCount = usage.byModel.length - 1;
    displayModelName = `${displayModelName} (+${additionalCount})`;
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
        border: hasMultipleModels
          ? '1px solid rgba(236, 72, 153, 0.4)'
          : '1px solid rgba(139, 92, 246, 0.25)',
        background: hasMultipleModels
          ? 'rgba(236, 72, 153, 0.08)'
          : 'rgba(139, 92, 246, 0.08)',
        color: hasMultipleModels ? '#f472b6' : '#a78bfa',
      }}
      title={tooltip}
    >
      <span style={{ fontSize: '12px' }}>{hasMultipleModels ? '🔀' : '⚡'}</span>
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
    </span>
  );
}

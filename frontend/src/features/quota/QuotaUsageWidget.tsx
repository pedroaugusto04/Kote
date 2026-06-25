import { Link } from 'react-router-dom';
import './quota.css';
import type { QuotaAndBillingStatusDTO } from '../../shared/api/billing';
import {
  buildQuotaMetrics,
  formatNextReset,
  formatResetDate,
  hasQuotaWarning,
  type QuotaMetric,
} from './quota.utils';

// ─── Sub-components ───────────────────────────────────────────────────────────

interface MetricBarProps {
  metric: QuotaMetric;
  compact?: boolean;
}

function MetricBar({ metric, compact }: MetricBarProps) {
  const barWidth = metric.isUnlimited ? 100 : metric.percent;

  return (
    <div className="quota-metric">
      <div className="quota-metric-header">
        <span className="quota-metric-label">{metric.label}</span>
        <span
          className={`quota-metric-values${metric.isUnlimited ? ' quota-metric-values--unlimited' : ''}`}
          title={metric.isUnlimited ? 'No limit' : `${metric.current} used of ${metric.limit}`}
        >
          {metric.isUnlimited ? '∞' : metric.formatted}
        </span>
      </div>
      <div className="quota-bar-track" role="progressbar" aria-valuenow={barWidth} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`quota-bar quota-bar--${metric.isUnlimited ? 'unlimited' : metric.color}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export interface QuotaUsageWidgetProps {
  /** Full subscription status from the API */
  status: QuotaAndBillingStatusDTO;
  /** Compact mode: smaller text, reduced gaps — ideal for sidebars */
  compact?: boolean;
  /** Hide the section title */
  hideTitle?: boolean;
  /** Show only the AI credits metric (compact sidebar usage) */
  aiOnly?: boolean;
}

/**
 * QuotaUsageWidget
 *
 * Renders current AI credit usage and (optionally) other resource quotas
 * with progress bars, health-colour coding, and a reset countdown.
 *
 * Use `compact={true}` for sidebar embedding and `aiOnly={true}` to show
 * only the AI credits bar (e.g. in a tight header slot).
 */
export function QuotaUsageWidget({ status, compact, hideTitle, aiOnly }: QuotaUsageWidgetProps) {
  const allMetrics = buildQuotaMetrics(status);
  const metrics = aiOnly ? allMetrics.slice(0, 1) : allMetrics;
  const hasWarning = hasQuotaWarning(status);
  const resetLabel = formatNextReset(status.currentPeriodEnd);
  const resetFull = formatResetDate(status.currentPeriodEnd);

  return (
    <div className={`quota-widget${compact ? ' quota-widget--compact' : ''}`}>
      {!hideTitle && (
        <div className="quota-widget-header">
          <span className="quota-widget-title">Quota Usage</span>
          <span className="quota-reset-badge" title={`Full reset on ${resetFull}`}>
            🔄 {resetLabel}
          </span>
        </div>
      )}

      {metrics.map((metric) => (
        <MetricBar key={metric.label} metric={metric} compact={compact} />
      ))}

      {compact && hasWarning && (
        <Link to="/subscription" className="quota-upgrade-link" title="Upgrade plan">
          ↑ Upgrade plan
        </Link>
      )}
    </div>
  );
}

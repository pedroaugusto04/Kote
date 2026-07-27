import type { QuotaAndBillingStatusDTO } from '../../shared/api/billing';

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Format bytes to a human-readable storage string, e.g. "1.2 GB", "512 MB" */
export function formatBytesHuman(bytes: number): string {
  if (bytes < 0) return 'Unlimited';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

/**
 * Returns a percentage clamped to [0, 100].
 * Returns 0 if limit is -1 (unlimited) or 0.
 */
export function quotaPercent(current: number, limit: number): number {
  if (limit <= 0) return 0; // unlimited or unset
  return Math.min(100, Math.round((current / limit) * 100));
}

/**
 * Returns a CSS colour token name appropriate for the given percentage:
 * - < 70%:  success green
 * - 70–89%: warning amber
 * - ≥ 90%:  danger red
 */
export function quotaHealthColor(percent: number): 'success' | 'warning' | 'danger' {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warning';
  return 'success';
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Format an ISO date string as "Jun 30, 2026" */
export function formatResetDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Return the number of whole days until an ISO date string */
export function daysUntil(iso: string): number {
  if (!iso) return 0;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

/** Format "Renews in N days" or "Renews today" label */
export function formatNextReset(iso: string): string {
  const days = daysUntil(iso);
  if (days === 0) return 'Resets today';
  if (days === 1) return 'Resets tomorrow';
  return `Resets in ${days} day${days === 1 ? '' : 's'}`;
}

// ─── Quota data helpers ───────────────────────────────────────────────────────

export interface QuotaMetric {
  label: string;
  current: number;
  limit: number;
  formatted: string;
  percent: number;
  color: 'success' | 'warning' | 'danger';
  isUnlimited: boolean;
}

/** Build a normalised QuotaMetric from raw values */
function makeMetric(label: string, current: number, limit: number, formatter: (n: number) => string): QuotaMetric {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : quotaPercent(current, limit);
  return {
    label,
    current,
    limit,
    formatted: isUnlimited ? `${formatter(current)} / Unlimited` : `${formatter(current)} / ${formatter(limit)}`,
    percent: pct,
    color: isUnlimited ? 'success' : quotaHealthColor(pct),
    isUnlimited,
  };
}

/** Extract all quota metrics from the status API response */
export function buildQuotaMetrics(status: QuotaAndBillingStatusDTO): QuotaMetric[] {
  const { limits, usage } = status;
  return [
    makeMetric('AI Credits', usage.aiCredits, limits.aiCredits, (n) => String(n)),
    makeMetric('Storage', usage.storage, limits.storage, formatBytesHuman),
    makeMetric('Workspaces', usage.workspaces, limits.workspaces, (n) => String(n)),
    makeMetric('Projects / workspace', usage.projects, limits.projects, (n) => String(n)),
  ];
}

/** Returns true if any resource is at ≥ 80% usage */
export function hasQuotaWarning(status: QuotaAndBillingStatusDTO): boolean {
  return buildQuotaMetrics(status).some((m) => !m.isUnlimited && m.percent >= 80);
}

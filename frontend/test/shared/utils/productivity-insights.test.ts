import { describe, expect, it } from 'vitest';
import { computeProductivityMetrics } from '../../../src/shared/utils/productivity-insights';

describe('computeProductivityMetrics', () => {
  const baseDate = new Date('2026-10-24T12:00:00Z');

  it('handles null or empty insights gracefully', () => {
    const metrics = computeProductivityMetrics(null, baseDate);
    expect(metrics.currentStreak).toBe(0);
    expect(metrics.totalAiInteractions).toBe(0);
    expect(metrics.weeklyAiData).toEqual([]);
    expect(metrics.hourlyCounts.length).toBe(24);
  });

  it('calculates streaks correctly when activity occurs today and yesterday', () => {
    const metrics = computeProductivityMetrics(
      {
        activities: [
          { createdAt: '2026-10-24T10:00:00Z', type: 'note', isAi: false },
          { createdAt: '2026-10-23T15:00:00Z', type: 'note', isAi: false },
          { createdAt: '2026-10-22T08:00:00Z', type: 'note', isAi: false },
          { createdAt: '2026-10-20T14:00:00Z', type: 'note', isAi: false }, // gap on 21st
        ],
      },
      baseDate,
    );

    expect(metrics.currentStreak).toBe(3);
    expect(metrics.totalAiInteractions).toBe(0);
  });

  it('aggregates AI sessions and hourly activity counts correctly', () => {
    const metrics = computeProductivityMetrics(
      {
        activities: [
          { createdAt: '2026-10-24T10:00:00Z', type: 'ask', isAi: true },
          { createdAt: '2026-10-24T10:30:00Z', type: 'ask', isAi: true },
          { createdAt: '2026-10-24T14:00:00Z', type: 'note', isAi: false },
        ],
      },
      baseDate,
    );

    expect(metrics.totalAiInteractions).toBe(2);
    expect(metrics.hourlyCounts.length).toBe(24);
    expect(metrics.weeklyAiData.length).toBe(4);
  });
});

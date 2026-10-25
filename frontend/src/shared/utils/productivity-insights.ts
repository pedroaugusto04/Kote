import type { ProductivityInsightsRaw } from '../api/models/productivity';

export interface WeeklyAiDataPoint {
  label: string;
  sessions: number;
}

export interface HourlyCountPoint {
  hour: number;
  label: string;
  Activity: number;
}

export interface ProductivityMetrics {
  currentStreak: number;
  weeklyAiData: WeeklyAiDataPoint[];
  hourlyCounts: HourlyCountPoint[];
  totalAiInteractions: number;
}

export function computeProductivityMetrics(
  insights?: Pick<ProductivityInsightsRaw, 'activities'> | null,
  baseDate = new Date(),
): ProductivityMetrics {
  const formatDateStr = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  const addDays = (dateStr: string, days: number): string => {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    return formatDateStr(d);
  };

  const getOffsetDateStr = (daysOffset: number) => {
    const d = new Date(baseDate.getTime());
    d.setDate(d.getDate() + daysOffset);
    return formatDateStr(d);
  };

  const todayStr = formatDateStr(baseDate);
  const yesterdayStr = formatDateStr(new Date(baseDate.getTime() - 24 * 60 * 60 * 1000));

  let currentStreak = 0;
  const weeklyAiData: WeeklyAiDataPoint[] = [];
  const hourlyCounts: HourlyCountPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    Activity: 0,
  }));
  let totalAiInteractions = 0;

  if (insights) {
    const activities = insights.activities || [];
    const activeDays = new Set<string>();
    const weeklyRanges = Array.from({ length: 4 }, (_, index) => {
      const i = 3 - index;
      const startStr = getOffsetDateStr(-i * 7 - 6);
      const endStr = getOffsetDateStr(-i * 7);
      return { startStr, endStr, sessions: 0 };
    });
    const thirtyDaysAgoStr = getOffsetDateStr(-30);

    for (const activity of activities) {
      const date = new Date(activity.createdAt);
      const dayStr = formatDateStr(date);
      activeDays.add(dayStr);

      if (activity.isAi) {
        totalAiInteractions++;
        for (const range of weeklyRanges) {
          if (dayStr >= range.startStr && dayStr <= range.endStr) {
            range.sessions++;
          }
        }
      }

      if (dayStr >= thirtyDaysAgoStr) {
        hourlyCounts[date.getHours()].Activity++;
      }
    }

    let startCheckingFrom: string | null = null;
    if (activeDays.has(todayStr)) {
      startCheckingFrom = todayStr;
    } else if (activeDays.has(yesterdayStr)) {
      startCheckingFrom = yesterdayStr;
    }

    if (startCheckingFrom) {
      let currentCheckStr = startCheckingFrom;
      while (activeDays.has(currentCheckStr)) {
        currentStreak++;
        currentCheckStr = addDays(currentCheckStr, -1);
      }
    }

    const formatShortDate = (str: string) => {
      const [, m, d] = str.split('-');
      return `${d}/${m}`;
    };

    weeklyAiData.push(
      ...weeklyRanges.map((range) => ({
        label: `${formatShortDate(range.startStr)} to ${formatShortDate(range.endStr)}`,
        sessions: range.sessions,
      })),
    );
  }

  return { currentStreak, weeklyAiData, hourlyCounts, totalAiInteractions };
}

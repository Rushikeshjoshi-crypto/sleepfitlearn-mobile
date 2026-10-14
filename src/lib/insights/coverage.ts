import type { DailyRecord, MetricKey } from "../api/insights";

// Pattern Coverage pair details — counts computed the same way the backend
// decides whether a pair becomes a correlation (sleepfitlearn-insights
// computeCorrelations): a day counts when metric_a has a value on that day and
// metric_b has one on the same day (lag 0) or the next day (lag 1).
// Same logic as the web app's src/lib/insights/coverage.ts — keep in sync.

// Backend MIN_SAMPLE_SIZE.
export const MIN_OVERLAP_DAYS = 14;

function shiftISODate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function overlapDays(
  daily: DailyRecord[],
  pair: { metric_a: MetricKey; metric_b: MetricKey; lag_days: number },
): number {
  const byDate = new Map(daily.map((r) => [r.date, r]));
  let count = 0;
  for (const rec of daily) {
    if (rec[pair.metric_a] == null) continue;
    const bRec = byDate.get(pair.lag_days ? shiftISODate(rec.date, pair.lag_days) : rec.date);
    if (bRec && bRec[pair.metric_b] != null) count += 1;
  }
  return count;
}

export function daysLogged(daily: DailyRecord[], metric: MetricKey): number {
  return daily.filter((r) => r[metric] != null).length;
}

// Where each metric is logged, for the popup's "Log …" buttons (the web
// app's METRIC_LOG_ROUTE, as mobile screens). Sleep and Habits are tabs.
export type LogTarget = { tab: "Sleep" | "Habits" } | { screen: "Exercise" | "Study" | "Personal" };
export const METRIC_LOG_TARGET: Record<MetricKey, LogTarget> = {
  sleep_hours: { tab: "Sleep" },
  exercise_minutes: { screen: "Exercise" },
  study_minutes: { screen: "Study" },
  screen_time_minutes: { tab: "Habits" },
  routine_adherence_pct: { tab: "Habits" },
  weight_kg: { screen: "Personal" },
  energy_level: { screen: "Personal" },
};

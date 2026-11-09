import type { Correlation, DailyRecord, MetricKey } from "../api/insights";
import { MIN_OVERLAP_DAYS, overlapDays, shiftISODate } from "./coverage";
import { POSSIBLE_PAIRS, pairKey } from "./metrics";

// Port of the web app's src/components/insights/patternPoints.ts — keep in sync.

type Pair = { metric_a: MetricKey; metric_b: MetricKey; lag_days: number };

// One dot per day the pair can be compared (same pairing rule as
// overlapDays / the backend): x = metric_a that day, y = metric_b on the same
// day (lag 0) or the next day (lag 1).
export function scatterPoints(daily: DailyRecord[], pair: Pair): { x: number; y: number; date: string }[] {
  const byDate = new Map(daily.map((r) => [r.date, r]));
  const points: { x: number; y: number; date: string }[] = [];
  for (const rec of daily) {
    const x = rec[pair.metric_a];
    if (x == null) continue;
    const other = byDate.get(pair.lag_days ? shiftISODate(rec.date, pair.lag_days) : rec.date);
    const y = other?.[pair.metric_b];
    if (y != null) points.push({ x, y, date: rec.date });
  }
  return points;
}

// Strength as filled dots out of 4 (shape, not just colour).
export const STRENGTH_DOTS: Record<Correlation["strength"], number> = {
  negligible: 1,
  weak: 2,
  moderate: 3,
  strong: 4,
};

// Pairs without a pattern yet, closest to the minimum first.
export function buildingPairs(daily: DailyRecord[], correlations: Correlation[]): (Pair & { overlap: number; pct: number })[] {
  const found = new Set(correlations.map(pairKey));
  return POSSIBLE_PAIRS.filter((p) => !found.has(pairKey(p)))
    .map((p) => {
      const overlap = overlapDays(daily, p);
      return { ...p, overlap, pct: Math.min(100, Math.round((overlap / MIN_OVERLAP_DAYS) * 100)) };
    })
    .sort((a, b) => b.overlap - a.overlap);
}

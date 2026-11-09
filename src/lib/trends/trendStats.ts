import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import type { AggregatedPoint } from "./activityAggregation";

export type DateRange = { from: string; to: string };

// The same number of days right before `range` (for "vs previous period").
export function previousRange(range: DateRange): DateRange {
  const days = differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1;
  const to = subDays(parseISO(range.from), 1);
  return { from: format(subDays(to, days - 1), "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
}

// Rows whose date falls inside `range` (inclusive "yyyy-MM-dd").
export function inRange<T>(rows: T[], dateFn: (row: T) => string, range: DateRange): T[] {
  return rows.filter((r) => {
    const d = dateFn(r);
    return typeof d === "string" && d >= range.from && d <= range.to;
  });
}

// Current minus previous, rounded; null when the previous period has no data.
export function change(current: number, previous: number, previousCount: number, digits = 1): number | null {
  if (previousCount === 0) return null;
  const f = 10 ** digits;
  return Math.round((current - previous) * f) / f;
}

// The highest bucket (label + value), or null.
export function best(points: AggregatedPoint[]): AggregatedPoint | null {
  return points.reduce<AggregatedPoint | null>((top, p) => (top === null || p.value > top.value ? p : top), null);
}

// Sparkline bar heights in % of the tallest (at least 8% so a bar shows).
export function sparkHeights(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? Math.max(8, Math.round((v / max) * 100)) : 8));
}

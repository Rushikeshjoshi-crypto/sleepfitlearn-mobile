// Port of the web app's src/lib/trends/activityAggregation.ts — keep the two in
// sync (same buckets, caps and ranges, so mobile and web Trends agree).
import {
  format,
  parseISO,
  subDays,
  startOfISOWeek,
  subWeeks,
  getISOWeek,
  getISOWeekYear,
  startOfMonth,
  subMonths,
  startOfYear,
  subYears,
} from "date-fns";
import { enUS } from "date-fns/locale";
import type { Locale } from "date-fns";

export type Period = "daily" | "weekly" | "monthly" | "yearly";
export type AggType = "avg" | "sum";
export type DailyPreset = "last3" | "week" | "month";

function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function yesterdayISO(): string {
  return toISODate(subDays(new Date(), 1));
}

// date-fns's format() reads local wall-clock fields, unlike toISOString()
// (which rolls back to the previous local day for any hour before the
// timezone offset catches up to midnight UTC) — safe to use directly for
// calendar-day window boundaries.
export function isoDaysAgo(days: number): string {
  return toISODate(subDays(new Date(), days));
}

// Daily is user-controlled; weekly/monthly/yearly are fixed lookback windows
// anchored on yesterday (today is excluded — matches the old app's behavior).
export function getEffectiveRange(
  period: Period,
  dailyRange: { from: string; to: string },
): { from: string; to: string } {
  const yesterday = subDays(new Date(), 1);
  if (period === "daily") return dailyRange;
  if (period === "weekly") {
    return { from: toISODate(subWeeks(startOfISOWeek(yesterday), 11)), to: toISODate(yesterday) };
  }
  if (period === "monthly") {
    return { from: toISODate(subMonths(startOfMonth(yesterday), 11)), to: toISODate(yesterday) };
  }
  return { from: toISODate(subYears(startOfYear(yesterday), 9)), to: toISODate(yesterday) };
}

export function getDailyPresetRange(preset: DailyPreset): { from: string; to: string } {
  const yesterday = subDays(new Date(), 1);
  const daysBack = preset === "last3" ? 2 : preset === "week" ? 6 : 29;
  return { from: toISODate(subDays(yesterday, daysBack)), to: toISODate(yesterday) };
}

function bucketKey(dateStr: string, period: Period): string {
  const d = parseISO(dateStr);
  if (period === "daily") return dateStr;
  if (period === "weekly") {
    return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`;
  }
  if (period === "monthly") return dateStr.slice(0, 7);
  return dateStr.slice(0, 4);
}

function bucketLabel(key: string, period: Period, locale: Locale): string {
  if (period === "daily") return format(parseISO(key), "MMM d", { locale });
  if (period === "weekly") {
    const [year, week] = key.split("-W");
    return `W${week} '${year.slice(2)}`;
  }
  if (period === "monthly") return format(parseISO(`${key}-01`), "MMM yyyy", { locale });
  return key;
}

const BUCKET_CAP: Record<Period, number | null> = {
  daily: null,
  weekly: 12,
  monthly: 12,
  yearly: 10,
};

export type AggregatedPoint = { key: string; label: string; value: number; count: number };

export function aggregate<T>(
  rows: T[],
  dateFn: (row: T) => string,
  valueFn: (row: T) => number | null | undefined,
  period: Period,
  aggType: AggType,
  locale: Locale = enUS,
): AggregatedPoint[] {
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const value = valueFn(row);
    if (value == null) continue;
    const key = bucketKey(dateFn(row), period);
    const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += value;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const points = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { sum, count }]) => ({
      key,
      label: bucketLabel(key, period, locale),
      value: aggType === "avg" ? sum / count : sum,
      count,
    }));

  const cap = BUCKET_CAP[period];
  return cap ? points.slice(-cap) : points;
}

export function computeKpis<T>(
  rows: T[],
  valueFn: (row: T) => number | null | undefined,
): { total: number; average: number; count: number } {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    const value = valueFn(row);
    if (value == null) continue;
    total += value;
    count += 1;
  }
  return { total, average: count > 0 ? total / count : 0, count };
}

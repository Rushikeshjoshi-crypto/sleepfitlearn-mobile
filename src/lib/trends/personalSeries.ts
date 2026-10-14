import type { PersonalEntry, SimpleMetricType } from "../api/fitness";
import type { HeartRateDailyMeta } from "../vitals/types";

export type WeightBmiPoint = { date: string; weight: number; bmi: number | undefined };
export type SimplePoint = { date: string; value: number };
export type BpPoint = { date: string; systolic: number | null; diastolic: number | null };
// Heart rate: a Health Connect day's average and a manual spot reading are
// different things, so they're two series that never join into one line.
export type HeartRatePoint = { date: string; hcAvg?: number; manual?: number };

// Port of the web app's src/lib/trends/personalSeries.ts — keep in sync.
// Mirrors the two shapes in the PersonalEntry union (src/lib/api/fitness.ts)
// so filtering can narrow by structure rather than fight the union's
// non-literal `kind` field on the value-carrying branch.
type ValueEntry = {
  kind: SimpleMetricType | "weight";
  date: string;
  value: number;
  sk: string;
  source: "health" | "weights";
  vitals?: HeartRateDailyMeta;
};
// Mobile's PersonalEntry bp branch has non-null values/sks (lib/api/fitness.ts).
type BpEntry = {
  kind: "bp";
  date: string;
  systolic: number;
  diastolic: number;
  sysSk: string;
  diaSk: string;
};

function isValueEntry(e: PersonalEntry): e is ValueEntry {
  return e.kind !== "bp";
}

function isBpEntry(e: PersonalEntry): e is BpEntry {
  return e.kind === "bp";
}

function byDateAsc<T extends { date: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

function entriesOfKind(entries: PersonalEntry[], kind: string): ValueEntry[] {
  return entries.filter(isValueEntry).filter((e) => e.kind === kind);
}

// Resolves each weight point's height from the most recent height_cm log
// entry dated on/before it (never a future one), falling back to the
// Settings profile height only when no such log entry exists yet — never a
// hardcoded constant.
export function buildWeightBmiSeries(
  entries: PersonalEntry[],
  profileHeightCm: number | null,
): WeightBmiPoint[] {
  const weights = byDateAsc(entriesOfKind(entries, "weight"));
  const heights = byDateAsc(entriesOfKind(entries, "height_cm"));

  let heightIndex = 0;
  let resolvedHeightCm: number | null = null;

  return weights.map((w) => {
    while (heightIndex < heights.length && heights[heightIndex].date <= w.date) {
      resolvedHeightCm = heights[heightIndex].value;
      heightIndex += 1;
    }
    const heightCm = resolvedHeightCm ?? profileHeightCm;
    const bmi = heightCm && heightCm > 0
      ? Math.round((w.value / Math.pow(heightCm / 100, 2)) * 10) / 10
      : undefined;
    return { date: w.date, weight: w.value, bmi };
  });
}

export function buildSimpleSeries(entries: PersonalEntry[], kind: SimpleMetricType): SimplePoint[] {
  return byDateAsc(entriesOfKind(entries, kind)).map((e) => ({ date: e.date, value: e.value }));
}

export function buildHeartRateSeries(entries: PersonalEntry[]): HeartRatePoint[] {
  return byDateAsc(entriesOfKind(entries, "heart_rate"))
    .map((e): HeartRatePoint => (e.vitals ? { date: e.date, hcAvg: e.value } : { date: e.date, manual: e.value }))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.hcAvg !== undefined) - Number(a.hcAvg !== undefined));
}

export function buildBpSeries(entries: PersonalEntry[]): BpPoint[] {
  return byDateAsc(entries.filter(isBpEntry)).map((e) => ({
    date: e.date,
    systolic: e.systolic,
    diastolic: e.diastolic,
  }));
}

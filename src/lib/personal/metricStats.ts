import { format, parseISO, subDays } from "date-fns";
import type { PersonalEntry } from "../api/fitness";

// Port of the web app's src/components/personal/metricStats.ts: client-side
// rollups for the Personal screen's focus panel, all from the entries the
// screen already loads.

export type MetricKey = PersonalEntry["kind"];

export const RANGES = ["7d", "30d", "90d", "1y"] as const;
export type RangeKey = (typeof RANGES)[number];
const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

// Every metric with a chip: the logged vitals, then the calculated energy level.
export const FOCUS_KINDS: MetricKey[] = ["weight", "bp", "heart_rate", "waist_cm", "chin_ups", "bench_press", "height_cm", "energy_level"];

// Strength metrics are sessions, drawn as bars; the rest as lines.
export const BAR_KINDS: MetricKey[] = ["chin_ups", "bench_press"];

// First day of the range ending today ("yyyy-MM-dd").
export function rangeStart(range: RangeKey, today: string): string {
  return format(subDays(parseISO(today), RANGE_DAYS[range] - 1), "yyyy-MM-dd");
}

// The metric to open on: the one logged most recently, else weight.
export function defaultKind(entries: PersonalEntry[]): MetricKey {
  const latest = [...entries].filter((e) => FOCUS_KINDS.includes(e.kind)).sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest?.kind ?? "weight";
}

// One number per entry for the stats (BP uses systolic / diastolic apart).
export function valueOf(entry: PersonalEntry): number | null {
  return entry.kind === "bp" ? null : entry.value;
}

export type RangeStats = { low: number; high: number; avg: number } | null;

export function rangeStats(values: number[]): RangeStats {
  if (values.length === 0) return null;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return { low: Math.min(...values), high: Math.max(...values), avg: Math.round(avg * 10) / 10 };
}

// Latest value vs the latest entry at least 30 days older (null when there
// is none): e.g. -1.2 for "1.2 kg lower than 30 days ago".
export function changeVs30Days(entries: PersonalEntry[]): number | null {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  if (!latest || latest.kind === "bp") return null;
  const cutoff = format(subDays(parseISO(latest.date), 30), "yyyy-MM-dd");
  const older = sorted.find((e) => e.date <= cutoff);
  if (!older || older.kind === "bp") return null;
  return Math.round((latest.value - older.value) * 10) / 10;
}

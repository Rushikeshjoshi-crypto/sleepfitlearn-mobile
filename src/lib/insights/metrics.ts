import type { Correlation, MetricKey } from "../api/insights";

// Mirrors the web app's src/lib/insights/metrics.ts — same pairs, same
// per-metric accent, just glyphs instead of lucide-react (no icon library on
// mobile, see HabitsScreen's EVENT_TYPE_GLYPH for the same convention) and
// hex colors instead of Tailwind classes (usable directly in RN styles).
export const METRIC_GLYPH: Record<MetricKey, string> = {
  sleep_hours: "🌙",
  exercise_minutes: "🏋️",
  study_minutes: "📖",
  screen_time_minutes: "📱",
  routine_adherence_pct: "✅",
  weight_kg: "⚖️",
  energy_level: "🔋",
};

export const METRIC_COLOR: Record<MetricKey, string> = {
  sleep_hours: "#3b82f6",
  exercise_minutes: "#f97316",
  study_minutes: "#10b981",
  screen_time_minutes: "#a855f7",
  routine_adherence_pct: "#f59e0b",
  weight_kg: "#f43f5e",
  energy_level: "#06b6d4",
};

// The full set of pairs the backend can ever return — used to render a
// coverage strip so "no correlation yet" reads as an expected state rather
// than something broken. Mirrors the web app's POSSIBLE_PAIRS exactly.
export const POSSIBLE_PAIRS: { metric_a: MetricKey; metric_b: MetricKey; lag_days: number }[] = [
  { metric_a: "sleep_hours", metric_b: "energy_level", lag_days: 1 },
  { metric_a: "screen_time_minutes", metric_b: "energy_level", lag_days: 1 },
  { metric_a: "routine_adherence_pct", metric_b: "energy_level", lag_days: 1 },
  { metric_a: "exercise_minutes", metric_b: "energy_level", lag_days: 1 },
  { metric_a: "exercise_minutes", metric_b: "sleep_hours", lag_days: 0 },
  { metric_a: "screen_time_minutes", metric_b: "sleep_hours", lag_days: 0 },
  { metric_a: "routine_adherence_pct", metric_b: "sleep_hours", lag_days: 0 },
  { metric_a: "exercise_minutes", metric_b: "weight_kg", lag_days: 0 },
  { metric_a: "sleep_hours", metric_b: "weight_kg", lag_days: 0 },
  { metric_a: "screen_time_minutes", metric_b: "study_minutes", lag_days: 0 },
];

export function pairKey(p: { metric_a: MetricKey; metric_b: MetricKey; lag_days: number }): string {
  return `${p.metric_a}->${p.metric_b}@${p.lag_days}`;
}

export function metricLabel(key: MetricKey, t: (key: string) => string): string {
  return t(`metricLabels.${key}`);
}

export function strengthLabel(key: Correlation["strength"], t: (key: string) => string): string {
  return t(`strengthLabels.${key}`);
}

// Plain-language, non-medical phrasing: always "associated with" / "tends to
// line up with", never "causes" or anything diagnostic.
export function describeCorrelation(
  c: Correlation,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const labelA = metricLabel(c.metric_a, t);
  const labelB = metricLabel(c.metric_b, t).toLowerCase();
  const qualifier = c.direction === "positive" ? t("correlationMore") : t("correlationLess");
  const timing = c.lag_days > 0 ? t("correlationNextDay") : "";
  return t("correlationTemplate", { labelA: labelA.toLowerCase(), qualifier, labelB, timing });
}

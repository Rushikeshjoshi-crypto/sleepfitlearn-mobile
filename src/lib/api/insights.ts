import { apiGet } from "./client";

// Mirrors the web app's src/lib/api/insights.ts exactly (same endpoint,
// same response shape).

export type MetricKey =
  | "sleep_hours"
  | "exercise_minutes"
  | "study_minutes"
  | "screen_time_minutes"
  | "routine_adherence_pct"
  | "weight_kg"
  | "energy_level";

export type DailyRecord = {
  date: string;
  sleep_hours: number | null;
  exercise_minutes: number | null;
  study_minutes: number | null;
  screen_time_minutes: number | null;
  routine_adherence_pct: number | null;
  weight_kg: number | null;
  energy_level: number | null;
};

export type CorrelationStrength = "negligible" | "weak" | "moderate" | "strong";
export type CorrelationDirection = "positive" | "negative";

export type Correlation = {
  metric_a: MetricKey;
  metric_b: MetricKey;
  lag_days: number;
  r: number;
  n: number;
  direction: CorrelationDirection;
  strength: CorrelationStrength;
};

export type InsightsResponse = {
  range: { from: string; to: string };
  daily: DailyRecord[];
  correlations: Correlation[];
};

// correlations/daily default to [] so the Insights screen never spreads or
// maps undefined.
export async function getInsights(range: { from: string; to: string }): Promise<InsightsResponse> {
  const r = (await apiGet<Partial<InsightsResponse>>("insights", "", range)) ?? {};
  return {
    range: r.range ?? range,
    daily: Array.isArray(r.daily) ? r.daily : [],
    correlations: Array.isArray(r.correlations) ? r.correlations : [],
  };
}

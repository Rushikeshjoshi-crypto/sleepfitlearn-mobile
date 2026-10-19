import { apiGet } from "./client";
import { todayISO } from "../dateRange";

export type DailyPoint = { date: string; day_label: string; hours: number };
export type DailyMinutesPoint = { date: string; day_label: string; minutes: number };
export type DailyWorkoutPoint = {
  date: string;
  day_label: string;
  worked_out: boolean;
  intensity: "low" | "moderate" | "high" | null;
};
export type DailyEnergyPoint = { date: string; day_label: string; value: number | null };
// steps null = no data that day (not 0 steps).
export type DailyStepsPoint = { date: string; day_label: string; steps: number | null };

// Insight *text* is computed client-side (see src/lib/insights/insightEngine.ts)
// from these raw series — the backend only returns data, not blurbs.
export type WeeklySnapshot = {
  range: { from: string; to: string };
  sleep: { avg_hours: number; daily: DailyPoint[] };
  fitness: { workout_days: number; daily: DailyWorkoutPoint[] };
  study: { total_hours: number; daily: DailyMinutesPoint[]; last_logged_at: string | null };
  energy: { daily: DailyEnergyPoint[] };
  steps: { avg: number | null; today: number | null; daily: DailyStepsPoint[] };
};

export type Timeline = {
  date: string;
  sleep: { bedtime: string | null; wake_time: string | null; duration_hours: number | null; notes: string | null } | null;
  workouts: { id: string; custom_activity_name: string | null; duration_minutes: number }[];
  study: { duration_minutes: number; session_type: string | null; notes: string | null } | null;
};

// ?today= is the user's local date: the dashboard Lambda ends the week /
// picks the timeline day from it (falling back to IST without it).
const days = <T>(list: unknown): T[] => (Array.isArray(list) ? list.filter((d) => d && typeof d === "object") : []) as T[];
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Missing sections, missing daily arrays and null day entries come back as
// safe defaults, so HomeScreen can read the snapshot without guards.
export async function getWeeklySnapshot(): Promise<WeeklySnapshot> {
  const s = (await apiGet<Partial<WeeklySnapshot>>("dashboard", "dashboard/weekly-snapshot", { today: todayISO() })) ?? {};
  return {
    range: s.range ?? { from: "", to: "" },
    sleep: { avg_hours: num(s.sleep?.avg_hours), daily: days<DailyPoint>(s.sleep?.daily) },
    fitness: { workout_days: num(s.fitness?.workout_days), daily: days<DailyWorkoutPoint>(s.fitness?.daily) },
    study: { total_hours: num(s.study?.total_hours), daily: days<DailyMinutesPoint>(s.study?.daily), last_logged_at: s.study?.last_logged_at ?? null },
    energy: { daily: days<DailyEnergyPoint>(s.energy?.daily) },
    // An older dashboard Lambda has no steps block → empty, not a crash.
    steps: { avg: numOrNull(s.steps?.avg), today: numOrNull(s.steps?.today), daily: days<DailyStepsPoint>(s.steps?.daily) },
  };
}

export async function getTimeline(): Promise<Timeline> {
  const tl = (await apiGet<Partial<Timeline>>("dashboard", "dashboard/timeline", { today: todayISO() })) ?? {};
  return {
    date: tl.date ?? "",
    sleep: tl.sleep ?? null,
    workouts: days<Timeline["workouts"][number]>(tl.workouts),
    study: tl.study ?? null,
  };
}

import type { WeeklySnapshot } from "../api/dashboard";
import type { DailyLogData } from "../insights/insightEngine";

// Zips the weekly-snapshot's parallel per-metric daily arrays (same dates,
// same order) into one row per day for the rule engine. Moved out of
// HomeScreen so it can be unit-tested; getWeeklySnapshot() already fills in
// missing sections/arrays, and everything past that is optional-chained so a
// partial day degrades to "no signal" instead of crashing the screen.
export function buildDailyLogs(snapshot: WeeklySnapshot): DailyLogData[] {
  return (snapshot.sleep?.daily ?? []).map((sleepDay, i) => ({
    date: sleepDay.date,
    sleepHours: sleepDay.hours ?? 0,
    workedOut: snapshot.fitness?.daily?.[i]?.worked_out ?? false,
    intensity: snapshot.fitness?.daily?.[i]?.intensity ?? null,
    studyMinutes: snapshot.study?.daily?.[i]?.minutes ?? 0,
    energy: snapshot.energy?.daily?.[i]?.value ?? null,
  }));
}

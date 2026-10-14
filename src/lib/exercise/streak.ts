import { isoDate } from "../dateRange";
import type { ExerciseEntry } from "../api/fitness";

// Consecutive days with a workout, counting back from today (local calendar
// days — toISOString() would start from the UTC date, a day behind between
// midnight and the UTC offset in IST).
export function computeStreak(entries: Pick<ExerciseEntry, "event_date">[]): number {
  const dates = new Set(entries.map((e) => e.event_date));
  let streak = 0;
  const cursor = new Date();
  while (dates.has(isoDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

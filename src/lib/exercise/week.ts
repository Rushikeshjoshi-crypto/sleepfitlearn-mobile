import { addDays, format, parseISO } from "date-fns";
import type { ExerciseEntry } from "../api/fitness";

export type WeekDay = { date: string; minutes: number; isToday: boolean; isFuture: boolean };

// The current week, Monday to Sunday, around `today` ("yyyy-MM-dd"): minutes
// per day, the week's total and how many entries (sessions) it has.
export function currentWeek(entries: ExerciseEntry[], today: string): { days: WeekDay[]; totalMinutes: number; sessions: number } {
  const t = parseISO(today);
  const monday = addDays(t, -((t.getDay() + 6) % 7));
  const dates = Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), "yyyy-MM-dd"));
  const inWeek = entries.filter((e) => e.event_date >= dates[0] && e.event_date <= dates[6]);
  const days = dates.map((date) => ({
    date,
    minutes: inWeek.filter((e) => e.event_date === date).reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0),
    isToday: date === today,
    isFuture: date > today,
  }));
  return { days, totalMinutes: days.reduce((s, d) => s + d.minutes, 0), sessions: inWeek.length };
}

// Days in a row with at least one entry, ending today (as before).
export function streakDays(entries: ExerciseEntry[], today: string): number {
  const logged = new Set(entries.map((e) => e.event_date));
  let streak = 0;
  for (let d = parseISO(today); logged.has(format(d, "yyyy-MM-dd")); d = addDays(d, -1)) streak++;
  return streak;
}

// Mini bar heights in px: the longest day = 60px, others in proportion (at
// least 8px so a short session still shows); no workouts = a 5px stub.
export const BAR_MAX_PX = 60;
export const BAR_STUB_PX = 5;

export function barHeights(minutes: number[]): number[] {
  const longest = Math.max(0, ...minutes);
  return minutes.map((m) => (m > 0 && longest > 0 ? Math.max(8, Math.round((m / longest) * BAR_MAX_PX)) : BAR_STUB_PX));
}

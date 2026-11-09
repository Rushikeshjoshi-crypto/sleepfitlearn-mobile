import { isoDaysAgo } from "../dateRange";
import type { StudySession } from "../api/study";

export type StudyWeekDay = { date: string; minutes: number; isToday: boolean };

export const BAR_MAX = 64;
export const BAR_MIN = 10;
export const BAR_STUB = 6;

// Last 7 days (oldest to today) with the minutes studied each day.
export function studyWeek(sessions: StudySession[]): { days: StudyWeekDay[]; total: number; count: number; thisWeek: StudySession[] } {
  const weekStart = isoDaysAgo(6);
  const thisWeek = sessions.filter((s) => s.session_date >= weekStart);
  const days = [6, 5, 4, 3, 2, 1, 0].map((ago) => {
    const date = isoDaysAgo(ago);
    return {
      date,
      minutes: thisWeek.filter((s) => s.session_date === date).reduce((n, s) => n + (s.duration_minutes ?? 0), 0),
      isToday: ago === 0,
    };
  });
  return { days, total: days.reduce((n, d) => n + d.minutes, 0), count: thisWeek.length, thisWeek };
}

// Busiest day = BAR_MAX, others in proportion (at least BAR_MIN); a day with
// no study is a BAR_STUB stub.
export function barHeight(minutes: number, busiest: number): number {
  if (minutes <= 0 || busiest <= 0) return BAR_STUB;
  return Math.max(BAR_MIN, Math.round((minutes / busiest) * BAR_MAX));
}

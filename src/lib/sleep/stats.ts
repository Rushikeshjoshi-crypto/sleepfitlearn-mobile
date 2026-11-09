import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, startOfMonth } from "date-fns";
import type { SleepEntry } from "../api/sleep";

// Month summary and calendar grid helpers for the Sleep page. Dates are local
// "yyyy-MM-dd" strings (the same as sleep_date: the night you went to bed).

export type SleepSummary = {
  nights: number; // nights with a duration
  averageHours: number | null;
  bestHours: number | null;
};

const hasHours = (e: SleepEntry): e is SleepEntry & { duration_hours: number } =>
  typeof e.duration_hours === "number" && Number.isFinite(e.duration_hours);

export function sleepSummary(entries: SleepEntry[]): SleepSummary {
  const timed = entries.filter(hasHours);
  return {
    nights: timed.length,
    averageHours: timed.length ? timed.reduce((s, e) => s + e.duration_hours, 0) / timed.length : null,
    bestHours: timed.length ? Math.max(...timed.map((e) => e.duration_hours)) : null,
  };
}

// 6.8 → { hours: 6, minutes: 48 }.
export function splitHours(hours: number): { hours: number; minutes: number } {
  const total = Math.round(hours * 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

// "2026-10" → first / last day of that month.
export function monthRange(month: string): { from: string; to: string } {
  const first = new Date(`${month}-01T00:00:00`);
  return { from: iso(startOfMonth(first)), to: iso(endOfMonth(first)) };
}

export function shiftMonth(month: string, by: number): string {
  return format(addMonths(new Date(`${month}-01T00:00:00`), by), "yyyy-MM");
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

// The month's days with blank cells before the 1st (weeks start on Monday)
// and after the last day, so every date sits under its weekday.
export function monthCells(month: string): (string | null)[] {
  const { from, to } = monthRange(month);
  const days = eachDayOfInterval({ start: new Date(`${from}T00:00:00`), end: new Date(`${to}T00:00:00`) }).map(iso);
  const lead = (getDay(new Date(`${from}T00:00:00`)) + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  return cells;
}

// Next month is off once it would start after today (fully in the future).
export function canGoToNextMonth(month: string, today: string): boolean {
  return monthRange(shiftMonth(month, 1)).from <= today;
}

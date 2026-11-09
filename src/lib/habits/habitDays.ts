import { isoDate } from "../dateRange";
import type { ContextEvent } from "../api/context";

// Client-side rollups for the Habits dashboard (port of the web's
// components/habits/habitDays.ts), all from the events the screen already
// loads. "filter" is the All habits value: "all" | "screen_time" | "routine".

export type DayState = "done" | "partial" | "missed" | "future";

// Local noon avoids DST edges when stepping whole days.
function parse(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function shiftDate(date: string, days: number): string {
  const d = parse(date);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

// Monday of the week containing `date`.
export function mondayOf(date: string): string {
  return shiftDate(date, -((parse(date).getDay() + 6) % 7));
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}

// Every date of the month `offset` months from today's (0 = this month).
export function monthDates(today: string, offset: number): string[] {
  const t = parse(today);
  const start = new Date(t.getFullYear(), t.getMonth() + offset, 1, 12);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(isoDate(d));
  return dates;
}

export function monthRange(today: string, offset: number): { from: string; to: string } {
  const dates = monthDates(today, offset);
  return { from: dates[0], to: dates[dates.length - 1] };
}

const adherence = (e: ContextEvent) => Number(e.metadata?.adherence_pct) || 0;

// Routine: 100% = done, 1-99% = partial, 0% / none = missed (best entry of the
// day counts). Screen time: any entry = done. All: routine decides; a day
// with only screen time (or a partial routine) is partial.
export function dayState(events: ContextEvent[], date: string, today: string, filter: string): DayState {
  if (date > today) return "future";
  const day = events.filter((e) => e.event_date === date);
  const routine = day.filter((e) => e.event_type === "routine");
  const best = routine.length ? Math.max(...routine.map(adherence)) : null;
  const hasScreenTime = day.some((e) => e.event_type === "screen_time");
  if (filter === "screen_time") return hasScreenTime ? "done" : "missed";
  if (best === 100) return "done";
  if ((best !== null && best > 0) || (filter === "all" && hasScreenTime)) return "partial";
  return "missed";
}

// % change vs last month, rounded; null without last month's data.
export function changePct(current: number, previous: number | undefined): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function encouragementKey(
  pct: number | null,
): "encourageNone" | "encourageLow" | "encourageMid" | "encourageHigh" {
  if (pct === null) return "encourageNone";
  if (pct >= 80) return "encourageHigh";
  if (pct >= 50) return "encourageMid";
  return "encourageLow";
}

export function screenTimeBetween(events: ContextEvent[], from: string, to: string): ContextEvent[] {
  return events.filter((e) => e.event_type === "screen_time" && e.event_date >= from && e.event_date <= to);
}

// One row per entry: a day's screen time rows merge into one row, routine
// entries stay one each. Newest first.
export function historyRows(events: ContextEvent[], type: ContextEvent["event_type"]): ContextEvent[][] {
  const ofType = events.filter((e) => e.event_type === type).sort((a, b) => b.event_date.localeCompare(a.event_date));
  if (type !== "screen_time") return ofType.map((e) => [e]);
  const byDay = new Map<string, ContextEvent[]>();
  for (const e of ofType) byDay.set(e.event_date, [...(byDay.get(e.event_date) ?? []), e]);
  return [...byDay.values()];
}

export const HISTORY_PAGE_SIZE = 10;

// First page: the last 7 days' entries (or the first 10 when none are that
// recent), then 10 more per "Show more".
export function initialCount(rows: ContextEvent[][], weekStart: string): number {
  const recent = rows.filter((r) => r[0].event_date >= weekStart).length;
  return recent > 0 ? recent : Math.min(HISTORY_PAGE_SIZE, rows.length);
}

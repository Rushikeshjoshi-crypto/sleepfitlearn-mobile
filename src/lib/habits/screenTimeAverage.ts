// Habits "This week" average screen time, per DAY: a day usually has several
// screen_time rows (one per sync), so each day's rows are added up first,
// then averaged over the days that have any. Averaging the rows directly
// reported a per-sync figure. Byte-identical in the web and mobile apps
// (src/lib/habits/screenTimeAverage.ts in both).

type ScreenTimeRow = {
  event_type: string;
  event_date?: string | null;
  metadata?: { minutes?: unknown } | null;
  kind?: string | null;
};

// A day with a screen time SNAPSHOT (the mobile backfill's one-row-per-day
// total from Android's usage record) is read from that row alone — its older
// delta rows (one per sync) would double-count. Days without one keep their
// deltas; other event types pass through. Same rule as the backend's
// shared/dailyRows.js effectiveScreenTimeRows.
export function effectiveScreenTimeEvents<T extends ScreenTimeRow>(events: T[]): T[] {
  const snapshotDays = new Set(
    events.filter((e) => e.event_type === "screen_time" && e.kind === "snapshot").map((e) => e.event_date),
  );
  return events.filter(
    (e) => e.event_type !== "screen_time" || e.kind === "snapshot" || !snapshotDays.has(e.event_date),
  );
}

export function averageDailyScreenTime(events: ScreenTimeRow[]): number | null {
  const byDay = new Map<string, number>();
  for (const e of effectiveScreenTimeEvents(events)) {
    if (e.event_type !== "screen_time" || !e.event_date) continue;
    const minutes = typeof e.metadata?.minutes === "number" ? e.metadata.minutes : 0;
    byDay.set(e.event_date, (byDay.get(e.event_date) ?? 0) + minutes);
  }
  if (byDay.size === 0) return null;
  return Math.round([...byDay.values()].reduce((a, b) => a + b, 0) / byDay.size);
}

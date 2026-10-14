// toISOString() alone rolls back to the previous local day for any hour
// before the timezone offset catches up to midnight UTC (e.g. every morning
// in UTC+ zones) — same bug class already fixed in screenTime/sync.ts's
// todayISO() and healthConnect/sync.ts's localDateOf(). Shift by the local
// offset before formatting so every calendar-day helper here agrees with
// those two on which day "now" falls on.
export function isoDate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return isoDate(new Date());
}

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

export function lastNDays(n: number): { date: string; dayLabel: string }[] {
  const days: { date: string; dayLabel: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ date: isoDate(d), dayLabel: d.toLocaleDateString(undefined, { weekday: "short" }) });
  }
  return days;
}

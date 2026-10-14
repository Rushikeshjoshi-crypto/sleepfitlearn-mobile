// What to read on a sync: everything since the last successful sync, but
// never more than 30 days back (the first sync is the full 30 — no Health
// Connect history permission is asked for). It starts at the START of the
// last sync's local day, so that day's HR summary is rebuilt from all of its
// samples rather than only the ones after the last sync.
export const MAX_SYNC_DAYS = 30;

export function vitalsSyncWindow(
  lastSyncAt: string | null,
  now: Date = new Date(),
  offsetMinutes: (d: Date) => number = (d) => d.getTimezoneOffset(),
): { from: string; to: string } {
  const earliest = new Date(now.getTime() - MAX_SYNC_DAYS * 86_400_000);
  let from = earliest;
  if (lastSyncAt) {
    const last = new Date(lastSyncAt);
    const offsetMs = offsetMinutes(last) * 60_000;
    // Local midnight of the last sync's day, as an instant.
    const local = new Date(last.getTime() - offsetMs);
    local.setUTCHours(0, 0, 0, 0);
    const dayStart = new Date(local.getTime() + offsetMs);
    if (dayStart > earliest) from = dayStart;
  }
  return { from: from.toISOString(), to: now.toISOString() };
}

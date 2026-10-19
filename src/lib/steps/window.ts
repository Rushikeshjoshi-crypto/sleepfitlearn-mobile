import { isoDate } from "../dateRange";

// Which local days a steps sync reads: from the day BEFORE the last
// successful sync (a watch often uploads yesterday's steps late, and the
// last sync's day was still in progress) through today. Never more than 30
// days back — Health Connect only allows 30 days before the permission was
// granted without the history permission, which isn't asked for — and the
// first sync is the full 30 days.
export const MAX_STEPS_SYNC_DAYS = 30;

const daysBefore = (d: Date, days: number) => {
  const out = new Date(d);
  out.setDate(out.getDate() - days);
  return out;
};

export function stepsSyncDates(lastSyncAt: string | null, now: Date = new Date()): { fromDate: string; toDate: string } {
  const earliest = isoDate(daysBefore(now, MAX_STEPS_SYNC_DAYS - 1));
  let fromDate = earliest;
  if (lastSyncAt) {
    const fromLast = isoDate(daysBefore(new Date(lastSyncAt), 1));
    if (fromLast > earliest) fromDate = fromLast;
  }
  return { fromDate, toDate: isoDate(now) };
}

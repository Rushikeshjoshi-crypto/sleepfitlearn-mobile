// Readers of screen time: a day with a snapshot (one row per day, from
// Android's usage record) is read from it alone — its old delta rows are
// kept in the database but ignored. Same rule as the backend.
import { averageDailyScreenTime, effectiveScreenTimeEvents } from "../src/lib/habits/screenTimeAverage";

const rows = [
  { event_type: "screen_time", event_date: "2026-10-10", metadata: { minutes: 30 } },
  { event_type: "screen_time", event_date: "2026-10-10", metadata: { minutes: 40 } },
  { event_type: "screen_time", event_date: "2026-10-10", kind: "snapshot", metadata: { minutes: 95 } },
  { event_type: "screen_time", event_date: "2026-10-09", metadata: { minutes: 20 } },
  { event_type: "screen_time", event_date: "2026-10-09", metadata: { minutes: 25 } },
  { event_type: "routine", event_date: "2026-10-10", metadata: { adherence_pct: 50 } },
];

test("snapshot day: deltas dropped; other days and other types untouched", () => {
  const out = effectiveScreenTimeEvents(rows);
  expect(out.filter((r) => r.event_date === "2026-10-10" && r.event_type === "screen_time").map((r) => r.metadata.minutes)).toEqual([95]);
  expect(out.filter((r) => r.event_date === "2026-10-09").length).toBe(2);
  expect(out.some((r) => r.event_type === "routine")).toBe(true);
});

test("average per day uses the snapshot, not snapshot + deltas", () => {
  // (95 + (20 + 25)) / 2 days = 70
  expect(averageDailyScreenTime(rows)).toBe(70);
});

test("no rows at all → no average (no data), never 0", () => {
  expect(averageDailyScreenTime([])).toBeNull();
});

test("the Android usage note and 'No data' exist in all 7 languages", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const m = require(`../src/i18n/locales/${lang}.json`);
    expect([lang, typeof m.Habits.androidUsageNote]).toEqual([lang, "string"]);
    expect([lang, typeof m.Family.Summary.noData]).toEqual([lang, "string"]);
  }
});

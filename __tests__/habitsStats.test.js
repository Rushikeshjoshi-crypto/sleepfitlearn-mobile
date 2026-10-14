// Habits "This week" average screen time is per DAY: each day's rows (one per
// sync) are added up first, then averaged over the days that have data — same
// helper as the web app (src/lib/habits/screenTimeAverage.ts in both).
import { averageDailyScreenTime } from "../src/lib/habits/screenTimeAverage";

const st = (date, minutes) => ({ event_type: "screen_time", event_date: date, metadata: { minutes } });

test("3 syncs on one day + 1 on the next → (120 + 60) / 2 = 90, not 45", () => {
  expect(averageDailyScreenTime([st("2026-10-05", 30), st("2026-10-05", 40), st("2026-10-05", 50), st("2026-10-06", 60)])).toBe(90);
});

test("no screen-time rows → null; non-numeric minutes count as 0", () => {
  expect(averageDailyScreenTime([])).toBeNull();
  expect(averageDailyScreenTime([{ event_type: "routine", event_date: "2026-10-05", metadata: {} }])).toBeNull();
  expect(averageDailyScreenTime([st("2026-10-05", "x"), st("2026-10-05", 30)])).toBe(30);
});

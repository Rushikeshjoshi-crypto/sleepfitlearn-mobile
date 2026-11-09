import { weekSeries, weekTabs, profileStats, gettingStartedItems, showGettingStarted, formatWeekRange } from "../src/lib/dashboard/home";

const snapshot = {
  range: { from: "2026-01-06", to: "2026-01-12" },
  sleep: { avg_hours: 7, daily: [{ date: "2026-01-11", day_label: "Sun", hours: 7 }, { date: "2026-01-12", day_label: "Mon", hours: 0 }] },
  fitness: { workout_days: 1, daily: [{ date: "2026-01-11", day_label: "Sun", worked_out: true }, { date: "2026-01-12", day_label: "Mon", worked_out: false }] },
  study: { total_hours: 0, daily: [{ date: "2026-01-11", day_label: "Sun", minutes: 0 }, { date: "2026-01-12", day_label: "Mon", minutes: 0 }], last_logged_at: null },
  energy: { daily: [] },
  steps: { avg: null, today: null, daily: [] },
};

test("weekTabs hides steps when not allowed", () => {
  expect(weekTabs(false)).toEqual(["sleep", "fitness", "study"]);
  expect(weekTabs(true)).toContain("steps");
});

test("weekSeries flags today and missing days", () => {
  const { value, bars } = weekSeries(snapshot, "sleep");
  expect(value).toBe(7);
  expect(bars[1].isToday).toBe(true);
  expect(bars[1].missing).toBe(true);
});

test("profileStats uses study hours when steps are not allowed", () => {
  expect(profileStats(snapshot, false)[2].key).toBe("studyThisWeek");
  expect(profileStats(snapshot, true)[2].key).toBe("stepsToday");
});

test("getting started items follow the steps gate", () => {
  const off = gettingStartedItems({ snapshot, timeline: null, profile: {}, stepsAllowed: false });
  expect(off.map((i) => i.key)).toEqual(["sleep", "study"]);
  expect(showGettingStarted(off)).toBe(true);
});

test("formatWeekRange", () => {
  expect(formatWeekRange("2026-01-06", "2026-01-12")).toBe("Jan 6 – Jan 12");
  expect(formatWeekRange("", "")).toBeNull();
});

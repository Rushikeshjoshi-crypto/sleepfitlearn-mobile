import { dayState, historyRows, initialCount, mondayOf, monthDates, weekDates, changePct } from "../src/lib/habits/habitDays";
import { barHeight } from "../src/lib/study/week";

const ev = (event_date, event_type, metadata = {}, sk = event_date + event_type) => ({ sk, id: sk, event_date, event_type, metadata, description: null, created_at: "" });

describe("habitDays", () => {
  test("week helpers", () => {
    expect(mondayOf("2026-11-04")).toBe("2026-11-02");
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
    expect(weekDates("2026-11-02")).toHaveLength(7);
    expect(monthDates("2026-11-15", -1)[0]).toBe("2026-10-01");
    expect(monthDates("2026-11-15", 0)).toHaveLength(30);
  });
  test("dayState", () => {
    const events = [ev("2026-11-01", "routine", { adherence_pct: 100 }), ev("2026-11-02", "screen_time", { minutes: 5 })];
    expect(dayState(events, "2026-11-01", "2026-11-03", "all")).toBe("done");
    expect(dayState(events, "2026-11-02", "2026-11-03", "all")).toBe("partial");
    expect(dayState(events, "2026-11-02", "2026-11-03", "screen_time")).toBe("done");
    expect(dayState(events, "2026-11-04", "2026-11-03", "all")).toBe("future");
  });
  test("history rows merge screen time per day and page", () => {
    const events = [ev("2026-11-02", "screen_time", {}, "a"), ev("2026-11-02", "screen_time", {}, "b"), ev("2026-10-01", "screen_time", {}, "c")];
    const rows = historyRows(events, "screen_time");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(2);
    expect(initialCount(rows, "2026-10-27")).toBe(1);
    expect(initialCount(rows, "2026-12-01")).toBe(2);
  });
  test("changePct and bar height", () => {
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(5, undefined)).toBeNull();
    expect(barHeight(0, 60)).toBe(6);
    expect(barHeight(60, 60)).toBe(64);
    expect(barHeight(1, 600)).toBe(10);
  });
});

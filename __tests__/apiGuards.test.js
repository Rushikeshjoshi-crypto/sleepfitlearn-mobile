// API-layer guards + ?today=: dashboard, family, insights, habits.
process.env.TZ = "Asia/Kolkata";

jest.mock("../src/lib/api/client", () => {
  class ApiError extends Error {
    constructor(status, message, code = null) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return { ApiError, apiGet: jest.fn(), apiPost: jest.fn(), apiPut: jest.fn(), apiDelete: jest.fn() };
});

import * as client from "../src/lib/api/client";
import { getTimeline, getWeeklySnapshot } from "../src/lib/api/dashboard";
import { getChildSummary, getConsentLog, listFamilyLinks } from "../src/lib/api/family";
import { getInsights } from "../src/lib/api/insights";
import { getApps, hasEventDate, prepareHabitHistory, topApps } from "../src/lib/api/context";
import { buildDailyLogs } from "../src/lib/dashboard/series";

const get = client.apiGet;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date("2026-10-05T20:00:00Z") }); // 01:30 IST on the 6th
});
afterEach(() => jest.useRealTimers());

test("dashboard requests send ?today=<local date>", async () => {
  get.mockResolvedValue({});
  await getWeeklySnapshot();
  await getTimeline();
  expect(get.mock.calls[0][2]).toEqual({ today: "2026-10-06" });
  expect(get.mock.calls[1][2]).toEqual({ today: "2026-10-06" });
});

test("weekly snapshot: missing sections / daily arrays / null days come back safe", async () => {
  get.mockResolvedValue({ sleep: { daily: [null, { date: "2026-10-06", day_label: "T", hours: 7 }] }, study: {} });
  const s = await getWeeklySnapshot();
  expect(s.sleep.avg_hours).toBe(0);
  expect(s.sleep.daily).toHaveLength(1);
  expect(s.fitness.daily).toEqual([]);
  expect(s.study.daily).toEqual([]);
  expect(s.study.total_hours).toBe(0);
  expect(s.energy.daily).toEqual([]);
  expect(() => buildDailyLogs(s)).not.toThrow();
});

test("timeline: missing workouts → []", async () => {
  get.mockResolvedValue({ date: "2026-10-06", sleep: null, study: null });
  expect((await getTimeline()).workouts).toEqual([]);
});

test("family: child summary sends ?today= and fills missing nested fields", async () => {
  get.mockResolvedValue({ sleep: { avg_hours: 7 }, personal: {}, habits: { avg_screen_time_minutes: 5 } });
  const s = await getChildSummary("l1", 7);
  expect(get.mock.calls[0][2]).toEqual({ days: "7", today: "2026-10-06" });
  expect(s.sleep?.daily).toEqual([]);
  expect(s.personal?.latest).toEqual([]);
  expect(s.habits?.daily).toEqual([]);
  expect(s.link.share_scopes).toEqual({});
});

test("family: links and consent log fill missing arrays / scopes / controls", async () => {
  get.mockResolvedValueOnce({ as_parent: [{ link_id: "l1" }] });
  const links = await listFamilyLinks();
  expect(links.as_child).toEqual([]);
  expect(links.as_parent[0].share_scopes).toEqual({});
  expect(links.as_parent[0].controls).toEqual({ daily_screen_time_limit_minutes: null, limit_warning_notifications: false, social_blocked: false });
  get.mockResolvedValueOnce({});
  expect((await getConsentLog("l1")).events).toEqual([]);
});

test("insights: missing correlations / daily → []", async () => {
  get.mockResolvedValue({ range: { from: "a", to: "b" } });
  const r = await getInsights({ from: "2026-09-01", to: "2026-10-06" });
  expect(r.correlations).toEqual([]);
  expect(r.daily).toEqual([]);
});

const ev = (event_date, apps) => ({ sk: String(event_date), event_type: "screen_time", event_date, metadata: { minutes: 10, apps } });

test("habits: events without a real event_date are skipped; apps need a string package_name", () => {
  expect(hasEventDate(ev("2026-10-05"))).toBe(true);
  for (const bad of [null, undefined, "", "yesterday", "2026-02-30", 20261005]) expect(hasEventDate(ev(bad))).toBe(false);
  const history = prepareHabitHistory([ev("2026-10-03"), ev(null), ev("2026-10-05"), ev("nope")]);
  expect(history.map((e) => e.event_date)).toEqual(["2026-10-05", "2026-10-03"]);
  expect(getApps(ev("2026-10-05", [{ package_name: "a", app_name: "A", minutes_used: 5 }, null, { app_name: "B" }, { package_name: 3 }]))).toEqual([
    { package_name: "a", app_name: "A", minutes_used: 5 },
  ]);
  expect(topApps([ev("2026-10-05", [{ package_name: "a", minutes_used: 5 }]), ev("2026-10-04", "junk")])).toEqual([
    { package_name: "a", app_name: "a", minutes_used: 5 },
  ]);
});

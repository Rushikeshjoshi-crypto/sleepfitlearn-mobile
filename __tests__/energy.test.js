// Energy level (Option A): a 0–100 score CALCULATED from the day's sleep and
// workout — never typed in — with the same formula and per-date sync as the
// web app (src/lib/energy/calculate.ts + sync.ts, byte-identical copies).
// Mobile's old 1–5 picker is gone, and its insight cards read the 0–100 scale.
jest.mock("../src/lib/api/client", () => {
  class ApiError extends Error {}
  return { ApiError, apiGet: jest.fn(), apiPost: jest.fn(), apiPut: jest.fn(), apiDelete: jest.fn() };
});

import * as client from "../src/lib/api/client";
import { calculateEnergy, sleepDurationScore, workoutScore } from "../src/lib/energy/calculate";
import { ENERGY_UNIT, syncEnergyForDate } from "../src/lib/energy/sync";
import { METRIC_META } from "../src/lib/api/fitness";
import { getEnergyInsight, getPatternInsight } from "../src/lib/insights/insightEngine";

const DATE = "2026-10-07";
// A day's energy uses the night before it (sleep_date = the evening it started).
const NIGHT = "2026-10-06";

// GET sleep / exercise / health for the date.
function day({ sleep = [], exercise = [], health = [] }) {
  client.apiGet.mockImplementation(async (domain, path) => {
    if (domain === "sleep") return sleep;
    if (path === "exercise") return exercise;
    if (path === "health") return health;
    return [];
  });
}

beforeEach(() => jest.clearAllMocks());

test("formula: same bands and weights as web", () => {
  expect(sleepDurationScore(8)).toBe(100);
  expect(sleepDurationScore(6.5)).toBe(75);
  expect(sleepDurationScore(4)).toBe(25);
  expect(workoutScore({ minutes: 45, intense: false })).toBe(100);
  expect(workoutScore({ minutes: 10, intense: false })).toBe(60);
  expect(workoutScore({ restDay: true })).toBe(70);
  // 0.6 × 100 + 0.4 × 60 = 84
  expect(calculateEnergy({ sleep: { hours: 8 }, workout: { minutes: 10, intense: false } })).toMatchObject({ score: 84, basis: "both", label: "high" });
  expect(calculateEnergy({ sleep: null, workout: null }).score).toBeNull();
});

test("sync: a date with sleep posts one energy_level row, 0–100, unit '/ 100'", async () => {
  day({ sleep: [{ sk: `${NIGHT}#s`, sleep_date: NIGHT, duration_hours: 8 }] });
  await syncEnergyForDate(DATE);
  expect(client.apiPost).toHaveBeenCalledWith(
    "fitness",
    "health",
    expect.objectContaining({ measured_at: DATE, metric_type: "energy_level", value: 100, unit: "/ 100" }),
  );
  expect(ENERGY_UNIT).toBe("/ 100");
});

test("sync: an old manual 1–5 row on that date is replaced by the calculated score", async () => {
  day({
    sleep: [{ sk: `${NIGHT}#s`, sleep_date: NIGHT, duration_hours: 5.5 }],
    health: [{ sk: `${DATE}#old`, measured_at: DATE, metric_type: "energy_level", value: 3, unit: "/ 5" }],
  });
  await syncEnergyForDate(DATE);
  expect(client.apiPut).toHaveBeenCalledWith(
    "fitness",
    `health/${encodeURIComponent(`${DATE}#old`)}`,
    expect.objectContaining({ value: 50, unit: "/ 100" }),
  );
});

test("sync: no sleep and no workout left → the date's energy row is removed", async () => {
  day({ health: [{ sk: `${DATE}#e`, measured_at: DATE, metric_type: "energy_level", value: 80, unit: "/ 100" }] });
  await syncEnergyForDate(DATE);
  expect(client.apiDelete).toHaveBeenCalledWith("fitness", `health/${encodeURIComponent(`${DATE}#e`)}`);
  expect(client.apiPost).not.toHaveBeenCalled();
});

test("energy_level is 0–100, calculated — not something you log by hand", () => {
  expect(METRIC_META.energy_level).toMatchObject({ unit: "/ 100", min: 0, max: 100, computed: true });
});

const log = (energy, workedOut = false) => ({ date: DATE, sleepHours: 8, workedOut, intensity: null, studyMinutes: 0, energy });

test("high_energy fires at 80+ on the 0–100 scale (was >= 8)", () => {
  expect(getEnergyInsight({ ...log(80), studyGapMinutes: null }).key).toBe("high_energy");
  expect(getEnergyInsight({ ...log(79), studyGapMinutes: null }).key).not.toBe("high_energy");
});

test("steady-energy copy reads out of 100, not 10", () => {
  const week = [log(70, true), log(70, true), log(71, false), log(70, false)];
  const card = getPatternInsight(week);
  expect(card.key).toBe("balanced_mood");
  // text now lives in i18n (InsightCards); the English copy says /100
  const body = require("../src/i18n/locales/en.json").InsightCards.balanced_mood.body;
  expect(body).toContain("{avg}/100");
});

// One night = one row (same rule as the dashboard's preferredSleepEntry):
// newest manual row, else newest Health Connect row — never the sum.
test("sync counts one sleep row per night (manual beats Health Connect), not the sum", async () => {
  day({
    sleep: [
      { sk: `${NIGHT}#m-old`, sleep_date: NIGHT, duration_hours: 5, notes: null, created_at: "2026-10-07T06:00:00.000Z" },
      { sk: `${NIGHT}#m`, sleep_date: NIGHT, duration_hours: 8, notes: null, created_at: "2026-10-07T07:00:00.000Z" },
      { sk: `${NIGHT}#hc`, sleep_date: NIGHT, duration_hours: 6, notes: "Synced from Health Connect", created_at: "2026-10-07T09:00:00.000Z" },
    ],
  });
  const { snapshot } = await syncEnergyForDate(DATE);
  expect(snapshot.sleepHours).toBe(8);
  const body = client.apiPost.mock.calls[0][2];
  expect(body.meta.sleep_sks).toEqual([`${NIGHT}#m`]);
  expect(body.value).toBe(100);
});

// "Last night" is saved with sleep_date = yesterday, so today's energy used to
// show "Sleep: not logged". Now a day reads the previous night only.
test("sync: a date's energy reads the previous night's sleep, not a night on that same date", async () => {
  day({ sleep: [{ sk: `${DATE}#same`, sleep_date: DATE, duration_hours: 8 }] });
  const { snapshot } = await syncEnergyForDate(DATE);
  expect(snapshot.sleepHours).toBeNull();
  expect(client.apiGet).toHaveBeenCalledWith("sleep", "", { from: NIGHT, to: NIGHT });
});

test("energyDateForSleep: a night counts for the next day's energy", () => {
  const { energyDateForSleep } = require("../src/lib/energy/sync");
  expect(energyDateForSleep("2026-10-15")).toBe("2026-10-16");
  expect(energyDateForSleep("2026-10-31")).toBe("2026-11-01");
  expect(energyDateForSleep("2026-12-31")).toBe("2027-01-01");
});

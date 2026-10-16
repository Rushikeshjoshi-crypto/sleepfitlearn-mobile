// Energy tile → popup (like the web's EnergyDialog): today's score with the
// sleep / workout breakdown, earlier days, and the rest-day switch.
import fs from "fs";
import path from "path";
import { energyBreakdown, shiftDay } from "../src/lib/energy/detail";

const snap = (over) => ({
  date: "2026-10-16",
  result: { score: 80, label: "high", basis: "both", sleepScore: 100, workoutScore: 100 },
  sleepHours: 7.54,
  workoutMinutes: 30,
  restDay: false,
  restDaySk: null,
  hasWorkoutEntries: true,
  ...over,
});

test("breakdown: sleep hours (1 decimal) and workout minutes with their scores", () => {
  expect(energyBreakdown(snap())).toEqual({
    sleep: { key: "sleepPart", values: { hours: "7.5", score: 100 } },
    workout: { key: "workoutPart", values: { minutes: 30, score: 100 } },
    basis: null,
  });
});

test("breakdown: missing parts, rest day, and 'based on' note (same rules as web)", () => {
  const onlySleep = snap({ result: { score: 100, label: "high", basis: "sleep", sleepScore: 100, workoutScore: null }, hasWorkoutEntries: false, workoutMinutes: null });
  expect(energyBreakdown(onlySleep)).toEqual({ sleep: { key: "sleepPart", values: { hours: "7.5", score: 100 } }, workout: { key: "workoutMissing", values: {} }, basis: "basedOnSleep" });
  const rest = snap({ result: { score: 70, label: "good", basis: "workout", sleepScore: null, workoutScore: 70 }, sleepHours: null, hasWorkoutEntries: false, restDay: true, workoutMinutes: null });
  expect(energyBreakdown(rest)).toEqual({ sleep: { key: "sleepMissing", values: {} }, workout: { key: "workoutRest", values: { score: 70 } }, basis: "basedOnWorkout" });
});

test("shiftDay moves by calendar days", () => {
  expect(shiftDay("2026-10-16", -1)).toBe("2026-10-15");
  expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
  expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
});

test("energy popup strings exist in all 7 languages", () => {
  const keys = ["title", "info", "empty", "basedOnSleep", "basedOnWorkout", "sleepPart", "sleepMissing", "workoutPart", "workoutRest", "workoutMissing", "restDayLabel", "loadError", "restDayError", "openDetailsAriaLabel", "previousDay", "nextDay"];
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const e = require(`../src/i18n/locales/${lang}.json`).Personal.energy;
    for (const k of keys) expect([lang, k, typeof e?.[k]]).toEqual([lang, k, "string"]);
  }
});

test("tapping the Energy tile opens the energy popup", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/screens/PersonalScreen.tsx"), "utf8");
  expect(src).toMatch(/kind === "energy_level" \? \(\) => setEnergyDetailOpen\(true\)/);
  expect(src).toMatch(/<EnergyDetailSection/);
});

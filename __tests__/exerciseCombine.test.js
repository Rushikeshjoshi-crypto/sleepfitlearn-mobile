// Exercise "Single entry" / "Combine": Combine joins today's newest
// non-Health-Connect row whatever its activity (same rule as the fitness
// Lambda's shared/dailyRows.js and the web app's src/lib/exercise/combine.ts);
// a combined row is grouped under each of its activities, and older rows
// without `activities` behave exactly as before.
import {
  exerciseActivityKey,
  exerciseParts,
  findCombineTarget,
  HC_NOTE_MARKER,
  isCombinedExercise,
  mergeExerciseActivity,
} from "../src/lib/exercise/combine";
import { activityGroupKeys, groupEntriesByActivity } from "../src/lib/exercise/activityNames";

const DATE = "2026-10-07";
const row = (sk, extra = {}) => ({
  sk, event_date: DATE, activity_type_id: "cycling", custom_activity_name: null, duration_minutes: 30, intensity: null, notes: null,
  created_at: "2026-10-07T06:00:00.000Z", ...extra,
});
const combinedRow = row("c", {
  duration_minutes: 75,
  activities: [
    { activity_type_id: "cycling", custom_activity_name: null, minutes: 30 },
    { activity_type_id: "running", custom_activity_name: null, minutes: 45 },
  ],
});

test("Combine is offered for any activity on the date, never another date", () => {
  const rows = [row("a"), row("b", { activity_type_id: "running", created_at: "2026-10-07T07:00:00.000Z" })];
  expect(findCombineTarget(rows, DATE)?.sk).toBe("b");
  expect(findCombineTarget(rows, "2026-10-06")).toBeNull();
});

test("a Health Connect row (or one without minutes) is never the target", () => {
  expect(findCombineTarget([row("hc", { notes: HC_NOTE_MARKER })], DATE)).toBeNull();
  expect(findCombineTarget([row("n", { duration_minutes: null })], DATE)).toBeNull();
});

test("merge: cycling + running = two parts; the same activity again adds to its part", () => {
  let parts = exerciseParts(row("a"));
  parts = mergeExerciseActivity(parts, { activity_type_id: "running", custom_activity_name: null, minutes: 45 });
  parts = mergeExerciseActivity(parts, { activity_type_id: "cycling", custom_activity_name: null, minutes: 15 });
  expect(parts.map((p) => [p.activity_type_id, p.minutes])).toEqual([["cycling", 45], ["running", 45]]);
  expect(exerciseActivityKey({ custom_activity_name: "  Yoga " })).toBe("name:yoga");
});

test("edit lock only for 2+ activities; an old row is a single part", () => {
  expect(isCombinedExercise(combinedRow)).toBe(true);
  expect(isCombinedExercise(row("old"))).toBe(false);
  expect(exerciseParts(row("old"))).toEqual([{ activity_type_id: "cycling", custom_activity_name: null, minutes: 30 }]);
});

test("history grouping: a combined row sits in each activity's box with that activity's minutes", () => {
  const groups = groupEntriesByActivity([combinedRow, row("old", { event_date: "2026-10-06" })], (k) => k);
  const cycling = groups.find((g) => g.key === "id:cycling");
  const running = groups.find((g) => g.key === "id:running");
  expect(cycling.items.map((e) => e.sk)).toEqual(["c", "old"]);
  expect(cycling.minutes.get("c")).toBe(30);
  expect(running.items.map((e) => e.sk)).toEqual(["c"]);
  expect(running.minutes.get("c")).toBe(45);
  expect(activityGroupKeys(combinedRow)).toEqual(["id:cycling", "id:running"]);
  expect(activityGroupKeys(row("old"))).toEqual(["id:cycling"]);
});

test("every locale has the Single/Combine strings and the new Timeline sleep label", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const m = require(`../src/i18n/locales/${lang}.json`);
    for (const k of ["entryModeLabel", "entryModeSingle", "entryModeCombine", "addedToExistingToast", "combineRejectedToast", "combinedEditLockedHint"]) {
      expect(m.Exercise[k]).toBeTruthy();
    }
    expect(m.Exercise.entryModeCombine).toMatch(/\{total\}/);
    expect(m.Exercise.entryModeCombine).not.toMatch(/\{name\}/);
    expect(m.Dashboard.lastNightSleepNotLogged).toBeTruthy();
  }
});

// "Connect your watch": the checkup that tells the user, in order, what's
// missing between their watch and this app — Health Connect installed, our
// permission, a watch app on the phone, and whether that app actually writes
// heart rate / BP / sleep into Health Connect — each with one action.
import { buildCheckup } from "../src/lib/watch/checkup";
import { KNOWN_WATCH_APPS, watchAppName } from "../src/lib/watch/knownApps";

const ALL = new Set(["SleepSession", "ExerciseSession", "Weight", "Steps", "HeartRate", "RestingHeartRate", "BloodPressure"]);
const base = {
  hcAvailable: true,
  granted: ALL,
  vitalsAllowed: true,
  installed: ["com.sec.android.app.shealth"],
  writers: { HeartRate: ["com.sec.android.app.shealth"], BloodPressure: [], SleepSession: ["com.sec.android.app.shealth"] },
};
const byId = (c) => Object.fromEntries(c.steps.map((s) => [s.id, s]));

test("all good: every step ok, data is flowing", () => {
  const c = buildCheckup(base);
  expect(c.ready).toBe(true);
  expect(c.steps.map((s) => s.status)).toEqual(["ok", "ok", "ok", "ok"]);
  expect(byId(c).data.writers).toEqual(["com.sec.android.app.shealth"]);
});

test("no Health Connect: only the install step, with the install action", () => {
  const c = buildCheckup({ ...base, hcAvailable: false });
  expect(c.ready).toBe(false);
  expect(c.steps).toEqual([{ id: "healthConnect", status: "todo", action: "installHealthConnect" }]);
});

test("permission missing → allow action (heart rate / BP only asked when allowed)", () => {
  const c = buildCheckup({ ...base, granted: new Set(["SleepSession"]) });
  expect(byId(c).permission).toEqual({ id: "permission", status: "todo", action: "allow" });
  const teen = buildCheckup({ ...base, vitalsAllowed: false, granted: new Set(["SleepSession", "ExerciseSession", "Weight", "Steps"]) });
  expect(byId(teen).permission.status).toBe("ok");
});

test("Steps is part of the permission set: everything but Steps granted → allow action", () => {
  const noSteps = new Set([...ALL].filter((t) => t !== "Steps"));
  const c = buildCheckup({ ...base, granted: noSteps });
  expect(byId(c).permission).toEqual({ id: "permission", status: "todo", action: "allow" });
});

test("steps not allowed (13–17 flag off): Steps isn't needed for the permission step", () => {
  const c = buildCheckup({ ...base, vitalsAllowed: false, stepsAllowed: false, granted: new Set(["SleepSession", "ExerciseSession", "Weight"]) });
  expect(byId(c).permission.status).toBe("ok");
});

test("no known watch app on the phone → info, not an error", () => {
  const c = buildCheckup({ ...base, installed: [], writers: { HeartRate: [], BloodPressure: [], SleepSession: [] } });
  expect(byId(c).watchApp).toEqual({ id: "watchApp", status: "todo", action: null, apps: [] });
});

test("watch app installed but nothing written → open that app to turn sharing on", () => {
  const c = buildCheckup({ ...base, writers: { HeartRate: [], BloodPressure: [], SleepSession: [] } });
  expect(byId(c).data).toEqual({ id: "data", status: "todo", action: "openWatchApp", app: "com.sec.android.app.shealth", writers: [] });
  expect(c.ready).toBe(false);
});

test("an app whose Health Connect support we can't confirm gets a 'may not share' hint, still with the open action", () => {
  const c = buildCheckup({ ...base, installed: ["com.crrepa.band.dafit"], writers: { HeartRate: [], BloodPressure: [], SleepSession: [] } });
  expect(byId(c).data).toMatchObject({ status: "todo", action: "openWatchApp", app: "com.crrepa.band.dafit", mayNotShare: true });
  // a confirmed one doesn't get the hint
  const s = buildCheckup({ ...base, writers: { HeartRate: [], BloodPressure: [], SleepSession: [] } });
  expect(byId(s).data.mayNotShare).toBeUndefined();
});

test("data from an app we don't list still counts (any Health Connect writer works)", () => {
  const c = buildCheckup({ ...base, installed: [], writers: { HeartRate: ["com.some.watch"], BloodPressure: [], SleepSession: [] } });
  expect(c.ready).toBe(true);
  expect(byId(c).watchApp.status).toBe("ok");
});

test("13–17 with the flag off: heart rate / BP writers don't count (they're never read)", () => {
  const c = buildCheckup({
    ...base,
    vitalsAllowed: false,
    granted: new Set(["SleepSession", "ExerciseSession", "Weight", "Steps"]),
    writers: { HeartRate: ["com.sec.android.app.shealth"], BloodPressure: [], SleepSession: [] },
  });
  expect(byId(c).data.status).toBe("todo");
});

test("known apps have names; unknown packages fall back to the package", () => {
  expect(KNOWN_WATCH_APPS.length).toBeGreaterThan(5);
  expect(watchAppName("com.sec.android.app.shealth")).toBe("Samsung Health");
  expect(watchAppName("com.x.y")).toBe("com.x.y");
});

test("Steps writers count when steps are allowed, and are ignored when they aren't", () => {
  const onlySteps = { HeartRate: [], BloodPressure: [], SleepSession: [], Steps: ["com.google.android.apps.fitness"] };
  const c = buildCheckup({ ...base, writers: onlySteps });
  expect(byId(c).data).toMatchObject({ status: "ok", writers: ["com.google.android.apps.fitness"] });
  const teen = buildCheckup({ ...base, vitalsAllowed: false, stepsAllowed: false, granted: new Set(["SleepSession", "ExerciseSession", "Weight"]), writers: onlySteps });
  expect(byId(teen).data.status).toBe("todo");
});

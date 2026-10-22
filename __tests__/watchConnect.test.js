// "Connect your watch": one tap asks Health Connect for everything at once
// (heart rate / BP only when the account may use them), switches both syncs
// on and runs them; the checkup loader only asks Health Connect about types
// it's allowed to read; the manifest lists every app the checkup looks for.
import fs from "fs";
import path from "path";

jest.mock("../src/lib/native/healthConnect", () => ({
  isAvailable: jest.fn(async () => true),
  requestAllPermissions: jest.fn(),
  getGrantedAllTypes: jest.fn(),
  recentWriters: jest.fn(async () => []),
  openHealthConnectInPlayStore: jest.fn(),
}));
jest.mock("../src/lib/native/watchApps", () => ({ installedWatchApps: jest.fn(async () => []), openWatchApp: jest.fn() }));
jest.mock("../src/lib/vitals/eligibility", () => ({ checkVitalsAccess: jest.fn() }));
jest.mock("../src/lib/aws/cognito", () => ({ getCurrentUserId: jest.fn(async () => "user-1") }));
jest.mock("../src/lib/healthConnect/preference", () => ({ setSyncEnabled: jest.fn(async () => {}) }));
jest.mock("../src/lib/vitals/preference", () => ({ setVitalsEnabled: jest.fn(async () => {}), giveVitalsConsent: jest.fn(async () => {}) }));
jest.mock("../src/lib/healthConnect/sync", () => ({ syncHealthConnect: jest.fn(async () => {}) }));
jest.mock("../src/lib/vitals/sync", () => ({ syncVitals: jest.fn(async () => {}) }));

import * as hc from "../src/lib/native/healthConnect";
import * as watchApps from "../src/lib/native/watchApps";
import { checkVitalsAccess } from "../src/lib/vitals/eligibility";
import { setSyncEnabled } from "../src/lib/healthConnect/preference";
import { setVitalsEnabled } from "../src/lib/vitals/preference";
import { syncHealthConnect } from "../src/lib/healthConnect/sync";
import { syncVitals } from "../src/lib/vitals/sync";
import { connectWatch } from "../src/lib/watch/connect";
import { loadCheckup } from "../src/lib/watch/loadCheckup";
import { KNOWN_WATCH_PACKAGES } from "../src/lib/watch/knownApps";

beforeEach(() => jest.clearAllMocks());

test("adult: one request for all six types, both syncs on, both run", async () => {
  checkVitalsAccess.mockResolvedValue({ allowed: true, ageBand: "18_plus" });
  hc.requestAllPermissions.mockResolvedValue(new Set(["SleepSession", "HeartRate", "BloodPressure"]));
  const out = await connectWatch();
  expect(hc.requestAllPermissions).toHaveBeenCalledTimes(1);
  expect(hc.requestAllPermissions).toHaveBeenCalledWith(true, true);
  expect(setSyncEnabled).toHaveBeenCalledWith(true);
  expect(setVitalsEnabled).toHaveBeenCalledWith("user-1", true);
  expect(syncHealthConnect).toHaveBeenCalled();
  expect(syncVitals).toHaveBeenCalled();
  expect(out.granted.size).toBe(3);
});

test("13–17 with the flag off: heart rate / BP never asked for or switched on", async () => {
  checkVitalsAccess.mockResolvedValue({ allowed: false, ageBand: "13_17" });
  hc.requestAllPermissions.mockResolvedValue(new Set(["SleepSession"]));
  await connectWatch();
  expect(hc.requestAllPermissions).toHaveBeenCalledWith(false, false);
  expect(setVitalsEnabled).not.toHaveBeenCalled();
  expect(syncVitals).not.toHaveBeenCalled();
  expect(setSyncEnabled).toHaveBeenCalledWith(true);
});

test("nothing granted: no sync switched on", async () => {
  checkVitalsAccess.mockResolvedValue({ allowed: true, ageBand: "18_plus" });
  hc.requestAllPermissions.mockResolvedValue(new Set());
  const out = await connectWatch();
  expect(out.granted.size).toBe(0);
  expect(setSyncEnabled).not.toHaveBeenCalled();
  expect(setVitalsEnabled).not.toHaveBeenCalled();
});

test("checkup loader: asks who wrote data only for types it may read; installed apps from the phone", async () => {
  checkVitalsAccess.mockResolvedValue({ allowed: false, ageBand: "13_17" });
  hc.getGrantedAllTypes.mockResolvedValue(new Set(["SleepSession", "ExerciseSession", "Weight", "Steps", "HeartRate"]));
  hc.recentWriters.mockResolvedValue(["com.sec.android.app.shealth"]);
  watchApps.installedWatchApps.mockResolvedValue(["com.sec.android.app.shealth"]);
  const c = await loadCheckup();
  expect(hc.recentWriters.mock.calls.map((x) => x[0])).toEqual(["SleepSession"]);
  expect(watchApps.installedWatchApps).toHaveBeenCalledWith(KNOWN_WATCH_PACKAGES);
  expect(c.ready).toBe(true);
});

test("checkup loader, adult: Steps writers are asked for too", async () => {
  checkVitalsAccess.mockResolvedValue({ allowed: true, ageBand: "18_plus" });
  hc.getGrantedAllTypes.mockResolvedValue(new Set(["SleepSession", "Steps", "HeartRate", "BloodPressure"]));
  hc.recentWriters.mockResolvedValue([]);
  await loadCheckup();
  expect(hc.recentWriters.mock.calls.map((x) => x[0]).sort()).toEqual(["BloodPressure", "HeartRate", "SleepSession", "Steps"]);
});

test("no Health Connect: the loader stops at the first step", async () => {
  checkVitalsAccess.mockResolvedValue({ allowed: true, ageBand: "18_plus" });
  hc.isAvailable.mockResolvedValueOnce(false);
  const c = await loadCheckup();
  expect(c.steps.map((s) => s.id)).toEqual(["healthConnect"]);
  expect(hc.getGrantedAllTypes).not.toHaveBeenCalled();
});

test("AndroidManifest <queries> lists exactly the known watch apps", () => {
  const xml = fs.readFileSync(path.join(__dirname, "..", "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
  const queries = xml.slice(xml.indexOf("<queries>"), xml.indexOf("</queries>"));
  const listed = [...queries.matchAll(/android:name="([^"]+)"/g)].map((m) => m[1]).sort();
  expect(listed).toEqual([...KNOWN_WATCH_PACKAGES].sort());
});

test("Watch strings exist in all 7 languages", () => {
  const keys = Object.keys(require("../src/i18n/locales/en.json").Watch);
  expect(keys.length).toBeGreaterThan(10);
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const w = require(`../src/i18n/locales/${lang}.json`).Watch;
    for (const k of keys) expect([lang, k, typeof w?.[k]]).toEqual([lang, k, "string"]);
  }
});

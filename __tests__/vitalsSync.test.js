// Heart rate / BP sync: gated on the account's age band + the minor flag,
// consent and the user's switch; HR goes up as one row per local day (never
// raw samples), BP one row per reading, manual entries are never touched,
// and the window is "since the last good sync", at most 30 days.
jest.mock("../src/lib/api/fitness", () => ({
  listHealthMetricsInRange: jest.fn(async () => []),
  createVitalsMetric: jest.fn(async () => ({})),
  updateVitalsMetric: jest.fn(async () => ({})),
  deleteHealthMetricRow: jest.fn(async () => {}),
}));
jest.mock("../src/lib/vitals/eligibility", () => ({ checkVitalsAccess: jest.fn() }));
jest.mock("../src/lib/syncGate", () => ({ isBackgroundSyncAllowed: () => true }));
jest.mock("../src/lib/aws/cognito", () => ({ getCurrentUserId: jest.fn(async () => "user-1") }));
jest.mock("@react-native-async-storage/async-storage", () => {
  let store = {};
  return {
    getItem: jest.fn(async (k) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k, v) => {
      store[k] = v;
    }),
    removeItem: jest.fn(async (k) => {
      delete store[k];
    }),
    __reset: () => {
      store = {};
    },
  };
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as api from "../src/lib/api/fitness";
import { checkVitalsAccess } from "../src/lib/vitals/eligibility";
import { syncVitals, deleteSyncedVitals } from "../src/lib/vitals/sync";
import { getVitalsState, giveVitalsConsent, setVitalsEnabled } from "../src/lib/vitals/preference";

const source = () => ({
  isAvailable: jest.fn(async () => true),
  grantedTypes: jest.fn(async () => new Set(["HeartRate", "RestingHeartRate", "BloodPressure"])),
  requestPermissions: jest.fn(),
  readHeartRate: jest.fn(async () => []),
  readRestingHeartRate: jest.fn(async () => []),
  readBloodPressure: jest.fn(async () => []),
  openSettings: jest.fn(),
});

const NOW = new Date("2026-10-12T12:00:00Z");

// Local noon of a date, so a test holds in any timezone.
const localNoon = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
};

async function connected() {
  await giveVitalsConsent("user-1");
  await setVitalsEnabled("user-1", true);
}

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.__reset();
  checkVitalsAccess.mockResolvedValue({ allowed: true, ageBand: "18_plus" });
  api.listHealthMetricsInRange.mockResolvedValue([]);
});

test("13–17 with the flag off (not allowed): nothing is read or uploaded", async () => {
  await connected();
  checkVitalsAccess.mockResolvedValue({ allowed: false, ageBand: "13_17" });
  const src = source();
  await syncVitals(src, NOW);
  expect(src.grantedTypes).not.toHaveBeenCalled();
  expect(src.readHeartRate).not.toHaveBeenCalled();
  expect(api.createVitalsMetric).not.toHaveBeenCalled();
});

test("no consent, or switched off: nothing happens", async () => {
  const src = source();
  await setVitalsEnabled("user-1", true);
  await syncVitals(src, NOW);
  await giveVitalsConsent("user-1");
  await setVitalsEnabled("user-1", false);
  await syncVitals(src, NOW);
  expect(src.readHeartRate).not.toHaveBeenCalled();
  expect(api.createVitalsMetric).not.toHaveBeenCalled();
});

test("first sync: 30 days; HR as one daily summary row, BP one row per reading", async () => {
  await connected();
  const src = source();
  src.readHeartRate.mockResolvedValue([
    { time: "2026-10-11T08:00:00Z", bpm: 70, origin: "com.sec.android.app.shealth" },
    { time: "2026-10-11T09:00:00Z", bpm: 90, origin: "com.sec.android.app.shealth" },
  ]);
  src.readRestingHeartRate.mockResolvedValue([{ time: "2026-10-11T05:00:00Z", bpm: 58, origin: "com.sec.android.app.shealth" }]);
  src.readBloodPressure.mockResolvedValue([
    { id: "bp1", time: "2026-10-11T07:00:00Z", systolic: 125, diastolic: 81, bodyPosition: 2, measurementLocation: 3, origin: "com.omronhealthcare.omronconnect" },
  ]);
  await syncVitals(src, NOW);

  const [from] = src.readHeartRate.mock.calls[0];
  expect(from).toBe("2026-09-12T12:00:00.000Z");

  const calls = api.createVitalsMetric.mock.calls;
  const hr = calls.find((c) => c[1] === "heart_rate");
  expect(hr[2]).toBe(80); // value = daily avg
  expect(hr[3]).toEqual({
    source: "health_connect",
    min: 70,
    max: 90,
    avg: 80,
    resting: 58,
    samples: 2,
    origins: ["com.sec.android.app.shealth"],
  });
  const bp = calls.find((c) => c[1] === "blood_pressure");
  expect(bp[2]).toBe(125);
  expect(bp[3]).toEqual({
    source: "health_connect",
    systolic: 125,
    diastolic: 81,
    time: "2026-10-11T07:00:00Z",
    body_position: 2,
    measurement_location: 3,
    origins: ["com.omronhealthcare.omronconnect"],
    hc_ids: ["bp1"],
  });
  expect((await getVitalsState("user-1")).lastSyncAt).toBe(NOW.toISOString());
});

test("next sync: from the last sync's day; today's HR row updated, unchanged rows and manual rows left alone, BP not re-sent", async () => {
  await connected();
  const src = source();
  // first sync to set lastSyncAt
  await syncVitals(src, new Date(localNoon("2026-10-11")));

  api.listHealthMetricsInRange.mockResolvedValue([
    { sk: "m1", measured_at: "2026-10-12", metric_type: "heart_rate", value: 75, unit: "bpm", meta: null },
    {
      sk: "h1", measured_at: "2026-10-12", metric_type: "heart_rate", value: 70, unit: "bpm",
      meta: { source: "health_connect", min: 70, max: 70, avg: 70, resting: null, samples: 1, origins: ["a"] },
    },
    {
      sk: "h0", measured_at: "2026-10-11", metric_type: "heart_rate", value: 60, unit: "bpm",
      meta: { source: "health_connect", min: 60, max: 60, avg: 60, resting: null, samples: 1, origins: ["a"] },
    },
    {
      sk: "b1", measured_at: "2026-10-12", metric_type: "blood_pressure", value: 120, unit: "mmHg",
      meta: { source: "health_connect", systolic: 120, diastolic: 80, hc_ids: ["bp1"], origins: ["a"] },
    },
  ]);
  src.readHeartRate.mockResolvedValue([
    { time: localNoon("2026-10-11"), bpm: 60, origin: "a" },
    { time: localNoon("2026-10-12"), bpm: 70, origin: "a" },
    { time: new Date(new Date(localNoon("2026-10-12")).getTime() + 60000).toISOString(), bpm: 90, origin: "a" },
  ]);
  src.readBloodPressure.mockResolvedValue([
    { id: "bp1", time: localNoon("2026-10-12"), systolic: 120, diastolic: 80, bodyPosition: null, measurementLocation: null, origin: "a" },
  ]);
  jest.clearAllMocks();
  await syncVitals(src, new Date(localNoon("2026-10-12")));

  expect(src.readHeartRate.mock.calls[0][0]).toBe(new Date(2026, 9, 11).toISOString());
  expect(api.updateVitalsMetric).toHaveBeenCalledTimes(1);
  expect(api.updateVitalsMetric.mock.calls[0][0]).toBe("h1");
  expect(api.updateVitalsMetric.mock.calls[0][4]).toMatchObject({ min: 70, max: 90, avg: 80, samples: 2 });
  expect(api.createVitalsMetric).not.toHaveBeenCalled();
});

test("a failed upload doesn't move the window forward (retried next time)", async () => {
  await connected();
  const src = source();
  src.readHeartRate.mockResolvedValue([{ time: "2026-10-11T08:00:00Z", bpm: 70, origin: "a" }]);
  api.createVitalsMetric.mockRejectedValueOnce(new Error("503"));
  await syncVitals(src, NOW);
  expect((await getVitalsState("user-1")).lastSyncAt).toBeNull();
});

test("delete: removes only Health Connect HR/BP rows from our server, keeps manual ones, and turns sync off", async () => {
  await connected();
  api.listHealthMetricsInRange.mockResolvedValue([
    { sk: "m1", metric_type: "heart_rate", meta: null },
    { sk: "h1", metric_type: "heart_rate", meta: { source: "health_connect" } },
    { sk: "b1", metric_type: "blood_pressure", meta: { source: "health_connect" } },
    { sk: "s1", metric_type: "bp_systolic", meta: null },
    { sk: "w1", metric_type: "weight", meta: null },
  ]);
  expect(await deleteSyncedVitals("user-1")).toBe(2);
  expect(api.deleteHealthMetricRow.mock.calls.map((c) => c[0])).toEqual(["h1", "b1"]);
  const state = await getVitalsState("user-1");
  expect(state.enabled).toBe(false);
  expect(state.lastSyncAt).toBeNull();
});

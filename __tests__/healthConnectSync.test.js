// R1: a Health Connect night that adds up past 24h is capped, and one date
// failing to save never stops the other dates.
jest.mock("../src/lib/native/healthConnect", () => ({
  hasPermissions: jest.fn(async () => true),
  getGrantedRecordTypes: jest.fn(async () => new Set(["SleepSession", "ExerciseSession", "Weight"])),
  readSleepSessions: jest.fn(),
  readExerciseSessions: jest.fn(async () => []),
  readWeights: jest.fn(async () => []),
}));
jest.mock("../src/lib/api/sleep", () => ({
  createSleepEntry: jest.fn(),
  listSleepEntries: jest.fn(async () => []),
}));
jest.mock("../src/lib/api/fitness", () => ({
  createExerciseEntry: jest.fn(),
  createWeightEntry: jest.fn(),
  listActivityTypes: jest.fn(async () => []),
  listExerciseEntries: jest.fn(async () => []),
  listWeights: jest.fn(async () => []),
  isWeightInRange: (kg) => Number.isFinite(kg) && kg >= 20 && kg <= 400,
}));
jest.mock("../src/lib/healthConnect/preference", () => ({ getSyncEnabled: jest.fn(async () => true) }));
jest.mock("../src/lib/syncGate", () => ({ isBackgroundSyncAllowed: () => true }));
jest.mock("../src/lib/steps/sync", () => ({ syncSteps: jest.fn(async () => {}) }));

import * as native from "../src/lib/native/healthConnect";
import * as sleepApi from "../src/lib/api/sleep";
import * as fitnessApi from "../src/lib/api/fitness";
import * as stepsSync from "../src/lib/steps/sync";
import { syncHealthConnect, syncHealthConnectIfEnabled } from "../src/lib/healthConnect/sync";

const mocked = (fn) => fn;

describe("steps job", () => {
  beforeEach(() => {
    mocked(native.readSleepSessions).mockResolvedValue([]);
  });

  test("runs only when Steps is granted", async () => {
    await syncHealthConnect();
    expect(stepsSync.syncSteps).not.toHaveBeenCalled();
    mocked(native.getGrantedRecordTypes).mockResolvedValueOnce(new Set(["Steps"]));
    await syncHealthConnect();
    expect(stepsSync.syncSteps).toHaveBeenCalledTimes(1);
  });

  test("a failing steps job doesn't stop sleep / exercise / weight", async () => {
    mocked(native.getGrantedRecordTypes).mockResolvedValueOnce(new Set(["Steps", "Weight"]));
    mocked(native.readWeights).mockResolvedValueOnce([{ time: "2026-10-06T07:00:00", weightKg: 70 }]);
    mocked(fitnessApi.createWeightEntry).mockResolvedValue({});
    mocked(stepsSync.syncSteps).mockRejectedValueOnce(new Error("aggregate failed"));
    await expect(syncHealthConnect()).resolves.toBeUndefined();
    expect(fitnessApi.createWeightEntry).toHaveBeenCalledTimes(1);
  });
});

beforeEach(() => jest.clearAllMocks());

test("sleep: a night summing past 24h (duplicate sources) is posted as 24", async () => {
  mocked(native.readSleepSessions).mockResolvedValue([
    { startTime: "2026-10-01T22:00:00", durationHours: 9 },
    { startTime: "2026-10-01T22:00:00", durationHours: 9 },
    { startTime: "2026-10-01T22:00:00", durationHours: 9 },
  ]);
  mocked(sleepApi.createSleepEntry).mockResolvedValue({});
  await syncHealthConnect();
  expect(mocked(sleepApi.createSleepEntry)).toHaveBeenCalledWith(
    expect.objectContaining({ sleep_date: "2026-10-01", duration_hours: 24 }),
  );
});

test("sleep: one date failing (e.g. a 400) doesn't skip the other dates or reject the sync", async () => {
  mocked(native.readSleepSessions).mockResolvedValue([
    { startTime: "2026-10-01T22:00:00", durationHours: 7 },
    { startTime: "2026-10-02T22:00:00", durationHours: 8 },
    { startTime: "2026-10-03T22:00:00", durationHours: 6 },
  ]);
  mocked(sleepApi.createSleepEntry)
    .mockRejectedValueOnce(new Error("400 duration_hours"))
    .mockResolvedValue({});
  await expect(syncHealthConnect()).resolves.toBeUndefined();
  const dates = mocked(sleepApi.createSleepEntry).mock.calls.map((c) => c[0].sleep_date);
  expect(dates).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
});

test("exercise: capped at 1440 minutes a day, and one failing date doesn't stop the rest", async () => {
  mocked(native.readSleepSessions).mockResolvedValue([]);
  mocked(native.readExerciseSessions).mockResolvedValue([
    { startTime: "2026-10-01T08:00:00", durationMinutes: 900, exerciseType: 1 },
    { startTime: "2026-10-01T08:00:00", durationMinutes: 900, exerciseType: 1 },
    { startTime: "2026-10-02T08:00:00", durationMinutes: 30, exerciseType: 1 },
  ]);
  mocked(fitnessApi.createExerciseEntry).mockRejectedValueOnce(new Error("boom")).mockResolvedValue({});
  await expect(syncHealthConnect()).resolves.toBeUndefined();
  const calls = mocked(fitnessApi.createExerciseEntry).mock.calls.map((c) => [c[0].event_date, c[0].duration_minutes]);
  expect(calls).toEqual([["2026-10-01", 1440], ["2026-10-02", 30]]);
});

// A night's sleep_date is the evening it started (same as "Last night" on the
// composers). A session starting 00:00–05:59 local belongs to the previous
// date's night; 06:00 onwards keeps its own date.
describe("sleep: sleep_date is the night's date", () => {
  const datesFor = async (sessions) => {
    mocked(native.readSleepSessions).mockResolvedValue(sessions);
    mocked(sleepApi.createSleepEntry).mockResolvedValue({});
    await syncHealthConnect();
    return mocked(sleepApi.createSleepEntry).mock.calls.map((c) => [c[0].sleep_date, c[0].duration_hours]);
  };

  test("starting at 00:30 on 10-07 is the night of 10-06", async () => {
    expect(await datesFor([{ startTime: "2026-10-07T00:30:00", durationHours: 7 }])).toEqual([["2026-10-06", 7]]);
  });

  test("05:59 is still the previous night; 06:00 is its own date", async () => {
    expect(
      await datesFor([
        { startTime: "2026-10-07T05:59:00", durationHours: 2 },
        { startTime: "2026-10-08T06:00:00", durationHours: 1 },
      ]),
    ).toEqual([["2026-10-06", 2], ["2026-10-08", 1]]);
  });

  test("a 23:00 start keeps its date, and a session after midnight joins the same night", async () => {
    expect(
      await datesFor([
        { startTime: "2026-10-06T23:00:00", durationHours: 3 },
        { startTime: "2026-10-07T02:30:00", durationHours: 4 },
      ]),
    ).toEqual([["2026-10-06", 7]]);
  });

  test("month boundary: 01:00 on 11-01 is the night of 10-31", async () => {
    expect(await datesFor([{ startTime: "2026-11-01T01:00:00", durationHours: 6 }])).toEqual([["2026-10-31", 6]]);
  });

  test("a night already logged for the previous date is skipped", async () => {
    mocked(sleepApi.listSleepEntries).mockResolvedValueOnce([{ sleep_date: "2026-10-06" }]);
    expect(await datesFor([{ startTime: "2026-10-07T00:30:00", durationHours: 7 }])).toEqual([]);
  });
});


// One permission denied (or one type failing to read) must never stop the
// other types from syncing; weights outside the app's 20–400 kg range are
// skipped (the web form and mobile Personal screen refuse them too).
describe("partial permissions, per-type failures, weight range", () => {
  beforeEach(() => {
    mocked(native.readSleepSessions).mockResolvedValue([{ startTime: "2026-10-06T22:00:00", durationHours: 7 }]);
    mocked(native.readExerciseSessions).mockResolvedValue([{ startTime: "2026-10-06T08:00:00", durationMinutes: 30, exerciseType: 1 }]);
    mocked(native.readWeights).mockResolvedValue([{ time: "2026-10-06T07:00:00", weightKg: 70 }]);
    mocked(sleepApi.createSleepEntry).mockResolvedValue({});
    mocked(fitnessApi.createExerciseEntry).mockResolvedValue({});
    mocked(fitnessApi.createWeightEntry).mockResolvedValue({});
  });

  test("only the granted record types are read and synced", async () => {
    mocked(native.getGrantedRecordTypes).mockResolvedValueOnce(new Set(["SleepSession", "Weight"]));
    await syncHealthConnect();
    expect(native.readExerciseSessions).not.toHaveBeenCalled();
    expect(fitnessApi.createExerciseEntry).not.toHaveBeenCalled();
    expect(sleepApi.createSleepEntry).toHaveBeenCalledTimes(1);
    expect(fitnessApi.createWeightEntry).toHaveBeenCalledTimes(1);
  });

  test("one type failing to read doesn't stop the others (and the sync still resolves)", async () => {
    mocked(native.readSleepSessions).mockRejectedValueOnce(new Error("SecurityException"));
    await expect(syncHealthConnect()).resolves.toBeUndefined();
    expect(fitnessApi.createWeightEntry).toHaveBeenCalledTimes(1);
    expect(fitnessApi.createExerciseEntry).toHaveBeenCalledTimes(1);
  });

  test("weights outside 20–400 kg are skipped", async () => {
    mocked(native.readWeights).mockResolvedValueOnce([
      { time: "2026-10-04T07:00:00", weightKg: 10 },
      { time: "2026-10-05T07:00:00", weightKg: 500 },
      { time: "2026-10-06T07:00:00", weightKg: 70.04 },
    ]);
    await syncHealthConnect();
    expect(fitnessApi.createWeightEntry.mock.calls).toEqual([["2026-10-06", 70]]);
  });

  test("syncHealthConnectIfEnabled runs with any permission granted, not only all of them", async () => {
    mocked(native.getGrantedRecordTypes).mockResolvedValue(new Set(["Weight"]));
    await syncHealthConnectIfEnabled();
    expect(fitnessApi.createWeightEntry).toHaveBeenCalledTimes(1);
    mocked(native.getGrantedRecordTypes).mockResolvedValue(new Set());
    jest.clearAllMocks();
    await syncHealthConnectIfEnabled();
    expect(native.readWeights).not.toHaveBeenCalled();
    mocked(native.getGrantedRecordTypes).mockResolvedValue(new Set(["SleepSession", "ExerciseSession", "Weight"]));
  });
});

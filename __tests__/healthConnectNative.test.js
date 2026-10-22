// Health Connect permissions: Sleep / Exercise / Weight (+ Steps when the
// account may use steps) are asked for together, and having SOME of them granted is enough to sync those — one
// denial no longer turns the whole sync off. Steps are read only as Health
// Connect's own daily aggregate (never by summing raw records).
jest.mock("react-native-health-connect", () => ({
  getSdkStatus: jest.fn(),
  SdkAvailabilityStatus: { SDK_AVAILABLE: 3 },
  initialize: jest.fn(async () => true),
  getGrantedPermissions: jest.fn(),
  requestPermission: jest.fn(),
  readRecords: jest.fn(),
  aggregateGroupByPeriod: jest.fn(),
}));

const { Platform } = require("react-native");
Platform.OS = "android";
const hcLib = require("react-native-health-connect");
const hc = require("../src/lib/native/healthConnect");

const read = (recordType) => ({ accessType: "read", recordType });

beforeEach(() => jest.clearAllMocks());

test("the permission request is Sleep, Exercise, Weight and Steps (read only)", async () => {
  hcLib.requestPermission.mockResolvedValue([read("SleepSession")]);
  await hc.requestPermissions(true);
  const asked = hcLib.requestPermission.mock.calls[0][0];
  expect(asked.map((p) => p.recordType).sort()).toEqual(["ExerciseSession", "SleepSession", "Steps", "Weight"]);
  expect(asked.every((p) => p.accessType === "read")).toBe(true);
});

test("steps not allowed for the account: Steps is not asked for (Sleep / Exercise / Weight unchanged)", async () => {
  hcLib.requestPermission.mockResolvedValue([read("SleepSession")]);
  await hc.requestPermissions(false);
  const asked = hcLib.requestPermission.mock.calls[0][0];
  expect(asked.map((p) => p.recordType).sort()).toEqual(["ExerciseSession", "SleepSession", "Weight"]);
});

test("Steps alone granted is enough to sync", async () => {
  hcLib.requestPermission.mockResolvedValue([read("Steps")]);
  expect(await hc.requestPermissions(true)).toBe(true);
});

test("requestStepsPermission asks for Steps only, true only when Steps was granted", async () => {
  hcLib.requestPermission.mockResolvedValue([read("Steps")]);
  expect(await hc.requestStepsPermission()).toBe(true);
  expect(hcLib.requestPermission.mock.calls[0][0]).toEqual([read("Steps")]);
  hcLib.requestPermission.mockResolvedValue([]);
  expect(await hc.requestStepsPermission()).toBe(false);
});

test("watch one-tap request: Steps and HR/BP only when allowed", async () => {
  hcLib.requestPermission.mockResolvedValue([]);
  await hc.requestAllPermissions(false, false);
  expect(hcLib.requestPermission.mock.calls[0][0].map((p) => p.recordType).sort()).toEqual(["ExerciseSession", "SleepSession", "Weight"]);
  await hc.requestAllPermissions(true, true);
  expect(hcLib.requestPermission.mock.calls[1][0].map((p) => p.recordType).sort()).toEqual(
    ["BloodPressure", "ExerciseSession", "HeartRate", "RestingHeartRate", "SleepSession", "Steps", "Weight"],
  );
});

test("partial grants count: requestPermissions / hasPermissions are true with any one granted", async () => {
  hcLib.requestPermission.mockResolvedValue([read("Weight")]);
  expect(await hc.requestPermissions(true)).toBe(true);
  hcLib.getGrantedPermissions.mockResolvedValue([read("SleepSession")]);
  expect(await hc.hasPermissions()).toBe(true);
  hcLib.getGrantedPermissions.mockResolvedValue([]);
  expect(await hc.hasPermissions()).toBe(false);
});

test("getGrantedRecordTypes lists exactly what was granted (Steps included, write access ignored)", async () => {
  hcLib.getGrantedPermissions.mockResolvedValue([read("SleepSession"), read("Steps"), { accessType: "write", recordType: "Weight" }]);
  expect([...(await hc.getGrantedRecordTypes())].sort()).toEqual(["SleepSession", "Steps"]);
});

// Daily totals come from aggregateGroupByPeriod (Health Connect's own
// de-duplication across apps/watches by the user's priority order), with
// local-day buckets. readRecords is never used for steps.
describe("readDailySteps", () => {
  const bucket = (date, count, origins = ["com.sec.android.app.shealth"]) => ({
    result: { COUNT_TOTAL: count, dataOrigins: origins },
    startTime: `${date}T00:00`,
    endTime: `${date}T23:59:59.999`,
  });
  // Local midnight of a date as an instant — what the library expects (it
  // converts the instant to device-local time itself).
  const localMidnight = (date) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).toISOString();
  };

  test("one aggregate call, DAYS slicer, local-midnight bounds, no dataOriginFilter", async () => {
    hcLib.aggregateGroupByPeriod.mockResolvedValue([bucket("2026-10-08", 4200), bucket("2026-10-09", 9100.4)]);
    const now = new Date(2026, 9, 20, 12, 0);
    const out = await hc.readDailySteps("2026-10-08", "2026-10-09", now);
    expect(out).toEqual([
      { date: "2026-10-08", steps: 4200, origins: ["com.sec.android.app.shealth"] },
      { date: "2026-10-09", steps: 9100, origins: ["com.sec.android.app.shealth"] },
    ]);
    expect(hcLib.aggregateGroupByPeriod).toHaveBeenCalledTimes(1);
    const req = hcLib.aggregateGroupByPeriod.mock.calls[0][0];
    expect(req.recordType).toBe("Steps");
    expect(req.timeRangeSlicer).toEqual({ period: "DAYS", length: 1 });
    expect(req.timeRangeFilter).toEqual({ operator: "between", startTime: localMidnight("2026-10-08"), endTime: localMidnight("2026-10-10") });
    expect(req.dataOriginFilter).toBeUndefined();
    expect(hcLib.readRecords).not.toHaveBeenCalled();
  });

  test("today's bucket ends at now, not tomorrow's midnight", async () => {
    hcLib.aggregateGroupByPeriod.mockResolvedValue([]);
    const now = new Date(2026, 9, 20, 9, 30);
    await hc.readDailySteps("2026-10-19", "2026-10-20", now);
    expect(hcLib.aggregateGroupByPeriod.mock.calls[0][0].timeRangeFilter.endTime).toBe(now.toISOString());
  });

  test("an empty bucket (no source, 0 steps) is not a day of data", async () => {
    hcLib.aggregateGroupByPeriod.mockResolvedValue([bucket("2026-10-08", 0, []), bucket("2026-10-09", 0)]);
    const out = await hc.readDailySteps("2026-10-08", "2026-10-09", new Date(2026, 9, 20));
    expect(out.map((d) => d.date)).toEqual(["2026-10-09"]);
  });
});

// Health Connect returns big reads in pages; sleep / exercise / weight used
// to read only the first one, so older or busy ranges lost data.
describe("sleep / exercise / weight read every page", () => {
  const range = ["2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"];
  const pages = (first, second) => {
    hcLib.readRecords.mockResolvedValueOnce({ records: first, pageToken: "p2" }).mockResolvedValueOnce({ records: second, pageToken: "" });
  };

  test("sleep", async () => {
    pages([{ startTime: "2026-09-01T22:00:00Z", endTime: "2026-09-02T06:00:00Z" }], [{ startTime: "2026-09-20T23:00:00Z", endTime: "2026-09-21T07:00:00Z" }]);
    const out = await hc.readSleepSessions(...range);
    expect(out).toHaveLength(2);
    expect(hcLib.readRecords).toHaveBeenCalledTimes(2);
    expect(hcLib.readRecords.mock.calls[1][1]).toMatchObject({ pageToken: "p2" });
  });

  test("exercise", async () => {
    const e = (d) => ({ startTime: `2026-09-${d}T07:00:00Z`, endTime: `2026-09-${d}T07:30:00Z`, exerciseType: 56 });
    pages([e("03")], [e("04"), e("05")]);
    expect(await hc.readExerciseSessions(...range)).toHaveLength(3);
  });

  test("weight", async () => {
    pages([{ time: "2026-09-03T07:00:00Z", weight: { inKilograms: 70 } }], [{ time: "2026-09-10T07:00:00Z", weight: { inKilograms: 69.5 } }]);
    expect((await hc.readWeights(...range)).map((w) => w.weightKg)).toEqual([70, 69.5]);
  });
});

// Health Connect permissions: Steps is never asked for (the app doesn't read
// it), and having SOME of Sleep / Exercise / Weight granted is enough to sync
// those — one denial no longer turns the whole sync off.
jest.mock("react-native-health-connect", () => ({
  getSdkStatus: jest.fn(),
  SdkAvailabilityStatus: { SDK_AVAILABLE: 3 },
  initialize: jest.fn(async () => true),
  getGrantedPermissions: jest.fn(),
  requestPermission: jest.fn(),
  readRecords: jest.fn(),
}));

const { Platform } = require("react-native");
Platform.OS = "android";
const hcLib = require("react-native-health-connect");
const hc = require("../src/lib/native/healthConnect");

const read = (recordType) => ({ accessType: "read", recordType });

beforeEach(() => jest.clearAllMocks());

test("the permission request is Sleep, Exercise and Weight — no Steps", async () => {
  hcLib.requestPermission.mockResolvedValue([read("SleepSession")]);
  await hc.requestPermissions();
  const asked = hcLib.requestPermission.mock.calls[0][0].map((p) => p.recordType).sort();
  expect(asked).toEqual(["ExerciseSession", "SleepSession", "Weight"]);
});

test("partial grants count: requestPermissions / hasPermissions are true with any one granted", async () => {
  hcLib.requestPermission.mockResolvedValue([read("Weight")]);
  expect(await hc.requestPermissions()).toBe(true);
  hcLib.getGrantedPermissions.mockResolvedValue([read("SleepSession")]);
  expect(await hc.hasPermissions()).toBe(true);
  hcLib.getGrantedPermissions.mockResolvedValue([]);
  expect(await hc.hasPermissions()).toBe(false);
});

test("getGrantedRecordTypes lists exactly what was granted (Steps ignored)", async () => {
  hcLib.getGrantedPermissions.mockResolvedValue([read("SleepSession"), read("Steps"), { accessType: "write", recordType: "Weight" }]);
  expect([...(await hc.getGrantedRecordTypes())]).toEqual(["SleepSession"]);
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

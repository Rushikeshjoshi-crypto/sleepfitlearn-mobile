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

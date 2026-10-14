// Heart rate / BP permissions are their own request (the existing Sleep /
// Exercise / Weight switch never asks for them), every page of a large HR
// read is fetched, and each reading keeps the app that wrote it.
jest.mock("react-native-health-connect", () => ({
  getSdkStatus: jest.fn(async () => 3),
  SdkAvailabilityStatus: { SDK_AVAILABLE: 3 },
  initialize: jest.fn(async () => true),
  getGrantedPermissions: jest.fn(),
  requestPermission: jest.fn(),
  readRecords: jest.fn(),
  openHealthConnectSettings: jest.fn(),
}));

const { Platform } = require("react-native");
Platform.OS = "android";
const hcLib = require("react-native-health-connect");
const hc = require("../src/lib/native/healthConnect");
const { healthConnectVitals } = require("../src/lib/vitals/healthConnectSource");

const read = (recordType) => ({ accessType: "read", recordType });

beforeEach(() => jest.clearAllMocks());

test("vitals ask for HeartRate, RestingHeartRate and BloodPressure only — no history / background", async () => {
  hcLib.requestPermission.mockResolvedValue([read("HeartRate")]);
  const granted = await healthConnectVitals.requestPermissions();
  const asked = hcLib.requestPermission.mock.calls[0][0].map((p) => p.recordType).sort();
  expect(asked).toEqual(["BloodPressure", "HeartRate", "RestingHeartRate"]);
  expect([...granted]).toEqual(["HeartRate"]);
});

test("the existing Sleep / Exercise / Weight request is unchanged, and doesn't count vitals as granted", async () => {
  hcLib.requestPermission.mockResolvedValue([read("HeartRate")]);
  expect(await hc.requestPermissions()).toBe(false);
  const asked = hcLib.requestPermission.mock.calls[0][0].map((p) => p.recordType).sort();
  expect(asked).toEqual(["ExerciseSession", "SleepSession", "Weight"]);
});

test("heart rate: every page is read, samples keep their source app", async () => {
  hcLib.readRecords
    .mockResolvedValueOnce({
      records: [{ samples: [{ time: "t1", beatsPerMinute: 70 }], metadata: { dataOrigin: "com.sec.android.app.shealth" } }],
      pageToken: "p2",
    })
    .mockResolvedValueOnce({
      records: [{ samples: [{ time: "t2", beatsPerMinute: 80 }], metadata: { dataOrigin: "com.fitbit.FitbitMobile" } }],
    });
  const samples = await healthConnectVitals.readHeartRate("a", "b");
  expect(samples).toEqual([
    { time: "t1", bpm: 70, origin: "com.sec.android.app.shealth" },
    { time: "t2", bpm: 80, origin: "com.fitbit.FitbitMobile" },
  ]);
  expect(hcLib.readRecords.mock.calls[1][1]).toMatchObject({ pageToken: "p2" });
});

test("blood pressure: values in mmHg, id, position/location and source app kept", async () => {
  hcLib.readRecords.mockResolvedValueOnce({
    records: [
      {
        time: "t1",
        systolic: { inMillimetersOfMercury: 121 },
        diastolic: { inMillimetersOfMercury: 79 },
        bodyPosition: 2,
        measurementLocation: 3,
        metadata: { id: "hc-1", dataOrigin: "com.omronhealthcare.omronconnect" },
      },
    ],
  });
  expect(await healthConnectVitals.readBloodPressure("a", "b")).toEqual([
    { id: "hc-1", time: "t1", systolic: 121, diastolic: 79, bodyPosition: 2, measurementLocation: 3, origin: "com.omronhealthcare.omronconnect" },
  ]);
});

test("granted vitals types come from Health Connect's granted list", async () => {
  hcLib.getGrantedPermissions.mockResolvedValue([read("BloodPressure"), read("SleepSession"), { accessType: "write", recordType: "HeartRate" }]);
  expect([...(await healthConnectVitals.grantedTypes())]).toEqual(["BloodPressure"]);
});

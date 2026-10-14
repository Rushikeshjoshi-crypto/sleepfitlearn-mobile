// Synced heart rate / BP rows next to manual entries: they're mapped with
// their source info, a Health Connect BP reading is one row, and the heart
// rate chart never joins a daily average and a manual spot reading into one line.
jest.mock("../src/lib/api/client", () => ({ apiGet: jest.fn(), apiPost: jest.fn(), apiPut: jest.fn(), apiDelete: jest.fn() }));

import * as client from "../src/lib/api/client";
import { listPersonalEntries, deleteBpEntry } from "../src/lib/api/fitness";
import { buildHeartRateSeries } from "../src/lib/trends/personalSeries";

beforeEach(() => jest.clearAllMocks());

const hcHr = { source: "health_connect", min: 60, max: 120, avg: 80, resting: 58, samples: 900, origins: ["com.sec.android.app.shealth"] };
const hcBp = {
  source: "health_connect", systolic: 128, diastolic: 82, time: "2026-10-11T07:00:00Z",
  body_position: null, measurement_location: null, origins: ["com.omronhealthcare.omronconnect"], hc_ids: ["x"],
};

function rows(health) {
  client.apiGet.mockImplementation(async (_d, path) => (path === "health" ? health : []));
}

test("synced rows carry their source; manual BP pairing is unchanged", async () => {
  rows([
    { sk: "h1", measured_at: "2026-10-11", metric_type: "heart_rate", value: 80, unit: "bpm", meta: hcHr },
    { sk: "m1", measured_at: "2026-10-11", metric_type: "heart_rate", value: 72, unit: "bpm", meta: null },
    { sk: "b1", measured_at: "2026-10-11", metric_type: "blood_pressure", value: 128, unit: "mmHg", meta: hcBp },
    { sk: "s1", measured_at: "2026-10-10", metric_type: "bp_systolic", value: 120, unit: "mmHg" },
    { sk: "d1", measured_at: "2026-10-10", metric_type: "bp_diastolic", value: 80, unit: "mmHg" },
  ]);
  const entries = await listPersonalEntries({ from: "2026-10-01", to: "2026-10-12" });
  const hr = entries.filter((e) => e.kind === "heart_rate");
  expect(hr.find((e) => e.sk === "h1").vitals).toEqual(hcHr);
  expect(hr.find((e) => e.sk === "m1").vitals).toBeUndefined();
  const bp = entries.filter((e) => e.kind === "bp");
  expect(bp).toEqual(
    expect.arrayContaining([
      { kind: "bp", date: "2026-10-11", systolic: 128, diastolic: 82, sysSk: "b1", diaSk: "b1", vitals: hcBp },
      { kind: "bp", date: "2026-10-10", systolic: 120, diastolic: 80, sysSk: "s1", diaSk: "d1" },
    ]),
  );
});

test("deleting a synced BP reading deletes its one row", async () => {
  client.apiDelete.mockResolvedValue(undefined);
  await deleteBpEntry("b1", "b1");
  expect(client.apiDelete).toHaveBeenCalledTimes(1);
});

test("HR chart: Health Connect daily average and manual readings are separate series", () => {
  const series = buildHeartRateSeries([
    { kind: "heart_rate", date: "2026-10-11", value: 80, source: "health", sk: "h1", vitals: hcHr },
    { kind: "heart_rate", date: "2026-10-11", value: 72, source: "health", sk: "m1" },
    { kind: "heart_rate", date: "2026-10-10", value: 75, source: "health", sk: "h0", vitals: { ...hcHr, avg: 75 } },
  ]);
  expect(series).toEqual([
    { date: "2026-10-10", hcAvg: 75 },
    { date: "2026-10-11", hcAvg: 80 },
    { date: "2026-10-11", manual: 72 },
  ]);
});

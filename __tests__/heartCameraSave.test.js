// Camera heart rate readings: saved as an ordinary heart_rate row marked
// meta.source "camera" (with quality + seconds), shown with a Camera badge,
// never touched by the Health Connect delete; strings in all 7 languages.
jest.mock("../src/lib/api/client", () => ({ apiGet: jest.fn(), apiPost: jest.fn(async () => ({})), apiPut: jest.fn(), apiDelete: jest.fn() }));

import * as client from "../src/lib/api/client";
import { createCameraHeartRate, listPersonalEntries } from "../src/lib/api/fitness";
import { isSyncedVitalsRow } from "../src/lib/vitals/sync";
import { MEASURE_MS } from "../src/lib/heartCamera/ppg";

beforeEach(() => jest.clearAllMocks());

test("save: one heart_rate row with source camera, quality and seconds", async () => {
  await createCameraHeartRate("2026-10-13", 72, "good", 30);
  expect(client.apiPost).toHaveBeenCalledWith("fitness", "health", {
    measured_at: "2026-10-13",
    metric_type: "heart_rate",
    value: 72,
    unit: "bpm",
    meta: { source: "camera", quality: "good", seconds: 30 },
  });
});

test("listed with its camera info; not a Health Connect row", async () => {
  const row = { sk: "c1", measured_at: "2026-10-13", metric_type: "heart_rate", value: 72, unit: "bpm", meta: { source: "camera", quality: "fair", seconds: 30 } };
  client.apiGet.mockImplementation(async (_d, path) => (path === "health" ? [row] : []));
  const [e] = await listPersonalEntries({ from: "2026-10-01", to: "2026-10-13" });
  expect(e).toMatchObject({ kind: "heart_rate", value: 72, camera: { quality: "fair", seconds: 30 } });
  expect(e.vitals).toBeUndefined();
  expect(isSyncedVitalsRow(row)).toBe(false);
});

test("a measurement is warm-up + 30 seconds", () => {
  expect(MEASURE_MS).toBe(35000);
});

test("camera heart rate strings exist in all 7 languages", () => {
  const keys = Object.keys(require("../src/i18n/locales/en.json").HeartCamera);
  expect(keys.length).toBeGreaterThan(15);
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const h = require(`../src/i18n/locales/${lang}.json`).HeartCamera;
    for (const k of keys) expect([lang, k, typeof h?.[k]]).toEqual([lang, k, "string"]);
  }
});

// Personal screen's "Heart rate & BP" section: the latest Health Connect HR
// day, recent BP readings (synced and manual, each with its source), and a
// delete button that reuses the existing deleteSyncedVitals — no new delete logic.
import fs from "fs";
import path from "path";
import { latestHeartRateDay, recentBloodPressure, hasSyncedVitals } from "../src/lib/vitals/display";

const hc = { source: "health_connect", min: 60, max: 120, avg: 80, resting: 58, samples: 9, origins: ["com.sec.android.app.shealth"] };
const entries = [
  { kind: "heart_rate", date: "2026-10-12", value: 72, source: "health", sk: "m1" },
  { kind: "heart_rate", date: "2026-10-11", value: 80, source: "health", sk: "h1", vitals: hc },
  { kind: "heart_rate", date: "2026-10-10", value: 75, source: "health", sk: "h0", vitals: { ...hc, avg: 75 } },
  { kind: "bp", date: "2026-10-12", systolic: 120, diastolic: 80, sysSk: "s", diaSk: "d" },
  { kind: "bp", date: "2026-10-11", systolic: 128, diastolic: 82, sysSk: "b1", diaSk: "b1", vitals: { source: "health_connect", origins: ["x"] } },
  { kind: "weight", date: "2026-10-12", value: 70, source: "health", sk: "w" },
];

test("latest HR card = the newest Health Connect day (manual readings aren't a daily summary)", () => {
  expect(latestHeartRateDay(entries)).toMatchObject({ date: "2026-10-11", vitals: hc });
  expect(latestHeartRateDay(entries.filter((e) => !e.vitals))).toBeNull();
});

test("BP history: newest first, synced and manual, capped", () => {
  expect(recentBloodPressure(entries, 5).map((e) => e.sysSk)).toEqual(["s", "b1"]);
  expect(recentBloodPressure(entries, 1)).toHaveLength(1);
});

test("delete button only when something was synced", () => {
  expect(hasSyncedVitals(entries)).toBe(true);
  expect(hasSyncedVitals(entries.filter((e) => !e.vitals))).toBe(false);
});

test("the section deletes through the existing deleteSyncedVitals only", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "components", "vitals", "VitalsPersonalSection.tsx"), "utf8");
  expect(src).toMatch(/deleteSyncedVitals/);
  expect(src).not.toMatch(/deleteHealthMetricRow|deleteBpEntry|apiDelete/);
});

test("its strings exist in all 7 languages", () => {
  const keys = ["sectionTitle", "hrCardTitle", "bpHistoryTitle", "emptyMobile", "deleteHcButton"];
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const v = require(`../src/i18n/locales/${lang}.json`).Vitals;
    for (const k of keys) expect([lang, k, typeof v[k]]).toEqual([lang, k, "string"]);
  }
});

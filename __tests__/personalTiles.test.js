// Personal screen tiles: Heart rate and Blood pressure show their own latest
// reading with source, colour hint and the extreme-value warning (the
// separate "Heart rate & BP" card moved into a details popup), and the
// Energy tile has the web's bar — width = score, colour from its label.
import { heartRateTile, bloodPressureTile, energyBar } from "../src/lib/vitals/tile";

const hcHr = { source: "health_connect", min: 60, max: 120, avg: 80, resting: 58, samples: 9, origins: ["com.sec.android.app.shealth"] };

test("heart rate tile: Health Connect day → average, resting with colour, source", () => {
  expect(heartRateTile({ kind: "heart_rate", date: "d", value: 80, source: "health", sk: "h", vitals: hcHr })).toEqual({
    value: "80", resting: 58, band: "watch", source: "Samsung Health", doctor: false,
  });
  expect(heartRateTile({ kind: "heart_rate", date: "d", value: 80, source: "health", sk: "h", vitals: { ...hcHr, resting: 130 } }).doctor).toBe(true);
});

test("heart rate tile: manual reading → the number, no colour, no source", () => {
  expect(heartRateTile({ kind: "heart_rate", date: "d", value: 72, source: "health", sk: "m" })).toEqual({
    value: "72", resting: null, band: "neutral", source: null, doctor: false,
  });
});

test("BP tile: colour only for a known source app and never for 13–17; warning at the extremes", () => {
  const omron = { source: "health_connect", systolic: 150, diastolic: 95, origins: ["com.omronhealthcare.omronconnect"] };
  const e = { kind: "bp", date: "d", systolic: 150, diastolic: 95, sysSk: "b", diaSk: "b", vitals: omron };
  expect(bloodPressureTile(e, "18_plus")).toEqual({ value: "150 / 95", resting: null, band: "high", source: "OMRON connect", doctor: false });
  expect(bloodPressureTile(e, "13_17").band).toBe("neutral");
  const manual = { kind: "bp", date: "d", systolic: 200, diastolic: 30, sysSk: "s", diaSk: "d" };
  expect(bloodPressureTile(manual, "18_plus")).toEqual({ value: "200 / 30", resting: null, band: "neutral", source: null, doctor: true });
});

test("energy bar: width is the score (0–100), colour comes from the shared energy label", () => {
  expect(energyBar(75)).toEqual({ percent: 75, label: "good" });
  expect(energyBar(85)).toEqual({ percent: 85, label: "high" });
  expect(energyBar(130).percent).toBe(100);
  expect(energyBar(-5).percent).toBe(0);
});

test("energy label strings exist in all 7 languages", () => {
  for (const lang of ["en", "hi", "bn", "de", "es", "fr", "it"]) {
    const labels = require(`../src/i18n/locales/${lang}.json`).Personal.energyLabels;
    for (const k of ["high", "good", "moderate", "low"]) expect([lang, k, typeof labels?.[k]]).toEqual([lang, k, "string"]);
  }
});

describe("which entry a tile shows", () => {
  const { tileEntry } = require("../src/lib/vitals/tile");
  const entries = [
    { kind: "energy_level", date: "2026-10-12", value: 75, source: "health", sk: "e1" },
    { kind: "weight", date: "2026-09-04", value: 58, source: "health", sk: "w1" },
  ];

  test("energy: only TODAY's entry — an older one leaves the tile blank", () => {
    expect(tileEntry(entries, "energy_level", "2026-10-15")).toBeNull();
    const withToday = [{ kind: "energy_level", date: "2026-10-15", value: 64, source: "health", sk: "e2" }, ...entries];
    expect(tileEntry(withToday, "energy_level", "2026-10-15").value).toBe(64);
  });

  test("other metrics still show their latest entry, whatever the day", () => {
    expect(tileEntry(entries, "weight", "2026-10-15").value).toBe(58);
  });
});

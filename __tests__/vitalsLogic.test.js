// Heart rate + blood pressure from Health Connect: the pure rules — the
// user's local day, daily HR stats (no raw samples leave the phone), BP
// dedupe across apps, the sync window, who may use it, and the colour bands.
import { localDayOf, dailyHeartRate, dedupeBloodPressure } from "../src/lib/vitals/aggregate";
import { vitalsSyncWindow } from "../src/lib/vitals/window";
import { vitalsAllowed } from "../src/lib/vitals/eligibility";
import {
  restingHeartRateBand,
  bloodPressureBand,
  heartRateNeedsDoctor,
  bloodPressureNeedsDoctor,
} from "../src/lib/vitals/ranges";
import { sourceLabel, isKnownBloodPressureSource } from "../src/lib/vitals/sourceLabel";

const IST = () => -330; // UTC+5:30 (Date#getTimezoneOffset sign)
const PDT = () => 420; // UTC-7

describe("the user's local day", () => {
  test("an instant is bucketed by the device's timezone, not UTC", () => {
    // 20:00 UTC on the 11th = 01:30 on the 12th in India, 13:00 on the 11th in California.
    expect(localDayOf("2026-10-11T20:00:00Z", IST)).toBe("2026-10-12");
    expect(localDayOf("2026-10-11T20:00:00Z", PDT)).toBe("2026-10-11");
  });

  test("daily HR stats use that local day", () => {
    const samples = [
      { time: "2026-10-11T18:00:00Z", bpm: 60, origin: "a" }, // IST 23:30 on the 11th
      { time: "2026-10-11T19:00:00Z", bpm: 90, origin: "a" }, // IST 00:30 on the 12th
    ];
    const ist = dailyHeartRate(samples, [], (t) => localDayOf(t, IST));
    expect(ist.map((d) => d.date)).toEqual(["2026-10-11", "2026-10-12"]);
    const pdt = dailyHeartRate(samples, [], (t) => localDayOf(t, PDT));
    expect(pdt.map((d) => [d.date, d.min, d.max])).toEqual([["2026-10-11", 60, 90]]);
  });
});

describe("daily heart rate", () => {
  const day = (t) => localDayOf(t, () => 0);

  test("min / avg / max / resting per day, sources listed", () => {
    const out = dailyHeartRate(
      [
        { time: "2026-10-10T08:00:00Z", bpm: 70, origin: "com.sec.android.app.shealth" },
        { time: "2026-10-10T09:00:00Z", bpm: 81, origin: "com.sec.android.app.shealth" },
        { time: "2026-10-10T10:00:00Z", bpm: 110, origin: "com.fitbit.FitbitMobile" },
      ],
      [
        { time: "2026-10-10T06:00:00Z", bpm: 58, origin: "com.sec.android.app.shealth" },
        { time: "2026-10-10T07:00:00Z", bpm: 57, origin: "com.sec.android.app.shealth" },
      ],
      day,
    );
    expect(out).toEqual([
      {
        date: "2026-10-10",
        min: 70,
        max: 110,
        avg: 87,
        resting: 57,
        samples: 3,
        origins: ["com.fitbit.FitbitMobile", "com.sec.android.app.shealth"],
      },
    ]);
  });

  test("the same sample written by two apps counts once", () => {
    const out = dailyHeartRate(
      [
        { time: "2026-10-10T08:00:00.000Z", bpm: 70, origin: "a" },
        { time: "2026-10-10T08:00:00.400Z", bpm: 70, origin: "b" },
        { time: "2026-10-10T08:05:00Z", bpm: 100, origin: "a" },
      ],
      [],
      day,
    );
    expect(out[0]).toMatchObject({ samples: 2, avg: 85, origins: ["a", "b"] });
  });

  test("impossible values are dropped; a day with only resting HR still shows it", () => {
    const out = dailyHeartRate(
      [{ time: "2026-10-10T08:00:00Z", bpm: 0, origin: "a" }, { time: "2026-10-10T08:01:00Z", bpm: 400, origin: "a" }],
      [{ time: "2026-10-10T06:00:00Z", bpm: 55, origin: "a" }],
      day,
    );
    expect(out).toEqual([{ date: "2026-10-10", min: null, max: null, avg: null, resting: 55, samples: 0, origins: ["a"] }]);
  });
});

describe("blood pressure dedupe", () => {
  test("same values within 2 minutes from two apps → one reading with both sources", () => {
    const out = dedupeBloodPressure([
      { id: "1", time: "2026-10-10T08:00:00Z", systolic: 128, diastolic: 82, bodyPosition: 0, measurementLocation: 0, origin: "omron" },
      { id: "2", time: "2026-10-10T08:01:30Z", systolic: 128, diastolic: 82, bodyPosition: 0, measurementLocation: 0, origin: "shealth" },
      { id: "3", time: "2026-10-10T08:10:00Z", systolic: 128, diastolic: 82, bodyPosition: 0, measurementLocation: 0, origin: "omron" },
      { id: "4", time: "2026-10-10T08:01:00Z", systolic: 131, diastolic: 82, bodyPosition: 0, measurementLocation: 0, origin: "shealth" },
    ]);
    expect(out.map((r) => [r.ids, r.origins])).toEqual([
      [["1", "2"], ["omron", "shealth"]],
      [["4"], ["shealth"]],
      [["3"], ["omron"]],
    ]);
  });

  test("impossible readings are dropped", () => {
    const out = dedupeBloodPressure([
      { id: "1", time: "2026-10-10T08:00:00Z", systolic: 20, diastolic: 10, bodyPosition: 0, measurementLocation: 0, origin: "x" },
      { id: "2", time: "2026-10-10T08:00:00Z", systolic: 80, diastolic: 90, bodyPosition: 0, measurementLocation: 0, origin: "x" },
    ]);
    expect(out).toEqual([]);
  });
});

describe("sync window: since the last sync, at most 30 days", () => {
  const now = new Date("2026-10-12T10:00:00Z");
  const offset = () => 0;

  test("first sync → 30 days", () => {
    expect(vitalsSyncWindow(null, now, offset).from).toBe("2026-09-12T10:00:00.000Z");
  });

  test("later syncs start at the local day of the last sync (so that day is recomputed)", () => {
    expect(vitalsSyncWindow("2026-10-10T15:30:00Z", now, offset).from).toBe("2026-10-10T00:00:00.000Z");
  });

  test("a last sync longer ago than 30 days is capped at 30", () => {
    expect(vitalsSyncWindow("2026-06-01T00:00:00Z", now, offset).from).toBe("2026-09-12T10:00:00.000Z");
  });
});

describe("who may use it (same rule as the backend's minorGate)", () => {
  const s = (age_band, enabled) => ({ age_band, enabled, can_invite: false, can_be_linked: false, consent_text_version: "v" });
  test("adults and accounts with no birth year: yes", () => {
    expect(vitalsAllowed(s("18_plus", false))).toBe(true);
    expect(vitalsAllowed(s(null, false))).toBe(true);
  });
  test("13–17: only while minor_data_enabled is on", () => {
    expect(vitalsAllowed(s("13_17", false))).toBe(false);
    expect(vitalsAllowed(s("13_17", true))).toBe(true);
  });
  test("under-13 or status unknown: no", () => {
    expect(vitalsAllowed(s("under_13", true))).toBe(false);
    expect(vitalsAllowed(null)).toBe(false);
  });
});

describe("colour bands (reference only, never a diagnosis)", () => {
  test("resting HR only", () => {
    expect(restingHeartRateBand(72)).toBe("good");
    expect(restingHeartRateBand(55)).toBe("watch");
    expect(restingHeartRateBand(110)).toBe("watch");
    expect(restingHeartRateBand(130)).toBe("high");
    expect(restingHeartRateBand(null)).toBe("neutral");
  });

  test("BP is coloured only for a known source app, and never for 13–17", () => {
    const known = { origins: ["com.omronhealthcare.omronconnect"], ageBand: "18_plus" };
    expect(bloodPressureBand(118, 76, known)).toBe("good");
    expect(bloodPressureBand(132, 84, known)).toBe("watch");
    expect(bloodPressureBand(150, 95, known)).toBe("high");
    expect(bloodPressureBand(150, 95, { origins: ["com.noname.watch"], ageBand: "18_plus" })).toBe("neutral");
    expect(bloodPressureBand(150, 95, { ...known, ageBand: "13_17" })).toBe("neutral");
    expect(bloodPressureBand(150, 95, { origins: [], ageBand: "18_plus" })).toBe("neutral");
  });

  test("'see a doctor' only at the extremes", () => {
    expect(heartRateNeedsDoctor(39)).toBe(true);
    expect(heartRateNeedsDoctor(121)).toBe(true);
    expect(heartRateNeedsDoctor(110)).toBe(false);
    expect(heartRateNeedsDoctor(null)).toBe(false);
    expect(bloodPressureNeedsDoctor(180, 100)).toBe(true);
    expect(bloodPressureNeedsDoctor(150, 120)).toBe(true);
    expect(bloodPressureNeedsDoctor(165, 105)).toBe(false);
  });
});

describe("source labels", () => {
  test("known packages get the app name, unknown ones show the package", () => {
    expect(sourceLabel("com.sec.android.app.shealth")).toBe("Samsung Health");
    expect(sourceLabel("com.example.watch")).toBe("com.example.watch");
    expect(isKnownBloodPressureSource("com.withings.wiscale2")).toBe(true);
    expect(isKnownBloodPressureSource("com.example.watch")).toBe(false);
  });
});

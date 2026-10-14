import type { BloodPressureReading, HeartRateSample } from "./types";

// The user's "day" is their local calendar day on this device, never UTC: a
// reading at 01:30 in India belongs to that morning's date. `offsetMinutes`
// is Date#getTimezoneOffset (injectable so tests can pin a timezone).
export function localDayOf(iso: string, offsetMinutes: (d: Date) => number = (d) => d.getTimezoneOffset()): string {
  const d = new Date(iso);
  return new Date(d.getTime() - offsetMinutes(d) * 60_000).toISOString().slice(0, 10);
}

// Readings outside these can't be real (a sensor glitch, a unit mix-up) and
// are dropped before anything is computed. HR: same 20–250 as the manual form.
const HR_MIN = 20;
const HR_MAX = 250;
const SYS_MIN = 50;
const SYS_MAX = 300;
const DIA_MIN = 30;
const DIA_MAX = 200;

const plausibleHr = (bpm: number) => Number.isFinite(bpm) && bpm >= HR_MIN && bpm <= HR_MAX;

export type DailyHeartRate = {
  date: string;
  min: number | null;
  max: number | null;
  avg: number | null;
  resting: number | null;
  samples: number;
  origins: string[];
};

// One summary per local day — the raw samples never leave the phone. A
// sample two apps both wrote (same second, same bpm) counts once. Resting HR
// is that day's latest resting reading.
export function dailyHeartRate(
  samples: HeartRateSample[],
  resting: HeartRateSample[],
  dayOf: (iso: string) => string = (iso) => localDayOf(iso),
): DailyHeartRate[] {
  type Bucket = { bpms: number[]; seen: Set<string>; origins: Set<string>; resting: HeartRateSample | null };
  const days = new Map<string, Bucket>();
  const bucket = (date: string) => {
    let b = days.get(date);
    if (!b) {
      b = { bpms: [], seen: new Set(), origins: new Set(), resting: null };
      days.set(date, b);
    }
    return b;
  };

  for (const s of samples) {
    if (!plausibleHr(s.bpm)) continue;
    const b = bucket(dayOf(s.time));
    b.origins.add(s.origin);
    const key = `${Math.floor(Date.parse(s.time) / 1000)}|${Math.round(s.bpm)}`;
    if (b.seen.has(key)) continue;
    b.seen.add(key);
    b.bpms.push(s.bpm);
  }
  for (const r of resting) {
    if (!plausibleHr(r.bpm)) continue;
    const b = bucket(dayOf(r.time));
    b.origins.add(r.origin);
    if (!b.resting || r.time > b.resting.time) b.resting = r;
  }

  return [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      min: b.bpms.length ? Math.round(Math.min(...b.bpms)) : null,
      max: b.bpms.length ? Math.round(Math.max(...b.bpms)) : null,
      avg: b.bpms.length ? Math.round(b.bpms.reduce((a, v) => a + v, 0) / b.bpms.length) : null,
      resting: b.resting ? Math.round(b.resting.bpm) : null,
      samples: b.bpms.length,
      origins: [...b.origins].sort(),
    }));
}

export type BloodPressureGroup = {
  time: string;
  systolic: number;
  diastolic: number;
  bodyPosition: number | null;
  measurementLocation: number | null;
  origins: string[];
  ids: string[];
};

// Two apps often write the same cuff reading (the cuff's own app and e.g.
// Samsung Health): same systolic/diastolic within 2 minutes is one reading,
// with every source kept. Different values are always separate readings.
const SAME_READING_MS = 2 * 60_000;

export function dedupeBloodPressure(readings: BloodPressureReading[]): BloodPressureGroup[] {
  const groups: BloodPressureGroup[] = [];
  const sorted = readings
    .filter(
      (r) =>
        r.systolic >= SYS_MIN && r.systolic <= SYS_MAX &&
        r.diastolic >= DIA_MIN && r.diastolic <= DIA_MAX &&
        r.systolic > r.diastolic,
    )
    .map((r) => ({ ...r, systolic: Math.round(r.systolic), diastolic: Math.round(r.diastolic) }))
    .sort((a, b) => a.time.localeCompare(b.time));

  for (const r of sorted) {
    const match = groups.find(
      (g) =>
        g.systolic === r.systolic &&
        g.diastolic === r.diastolic &&
        Math.abs(Date.parse(g.time) - Date.parse(r.time)) <= SAME_READING_MS,
    );
    if (match) {
      if (!match.origins.includes(r.origin)) match.origins = [...match.origins, r.origin].sort();
      match.ids.push(r.id);
    } else {
      groups.push({
        time: r.time,
        systolic: r.systolic,
        diastolic: r.diastolic,
        bodyPosition: r.bodyPosition,
        measurementLocation: r.measurementLocation,
        origins: [r.origin],
        ids: [r.id],
      });
    }
  }
  return groups;
}

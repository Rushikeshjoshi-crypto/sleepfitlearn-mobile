import { getGrantedAllTypes, isAvailable, recentWriters } from "../native/healthConnect";
import { installedWatchApps } from "../native/watchApps";
import { checkVitalsAccess } from "../vitals/eligibility";
import { buildCheckup, type Checkup } from "./checkup";
import { KNOWN_WATCH_PACKAGES } from "./knownApps";

const LOOKBACK_DAYS = 30;

// Gathers what the checkup needs from the phone. Only asks Health Connect who
// wrote a type when we may read it (granted, and for heart rate / BP only
// when the account may use them).
export async function loadCheckup(now: Date = new Date()): Promise<Checkup> {
  const [available, access] = await Promise.all([isAvailable().catch(() => false), checkVitalsAccess()]);
  if (!available) {
    return buildCheckup({ hcAvailable: false, granted: new Set(), vitalsAllowed: access.allowed, installed: [], writers: { HeartRate: [], BloodPressure: [], SleepSession: [] } });
  }
  const [granted, installed] = await Promise.all([getGrantedAllTypes(), installedWatchApps(KNOWN_WATCH_PACKAGES)]);
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const to = now.toISOString();
  const may = (t: "HeartRate" | "BloodPressure" | "SleepSession") =>
    granted.has(t) && (t === "SleepSession" || access.allowed);
  const writersOf = async (t: "HeartRate" | "BloodPressure" | "SleepSession") => (may(t) ? recentWriters(t, from, to) : []);
  const [HeartRate, BloodPressure, SleepSession] = [
    await writersOf("HeartRate"),
    await writersOf("BloodPressure"),
    await writersOf("SleepSession"),
  ];
  return buildCheckup({ hcAvailable: true, granted, vitalsAllowed: access.allowed, installed, writers: { HeartRate, BloodPressure, SleepSession } });
}

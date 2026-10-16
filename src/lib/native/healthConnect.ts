import { Linking, Platform } from "react-native";
import {
  getSdkStatus,
  SdkAvailabilityStatus,
  initialize,
  getGrantedPermissions,
  requestPermission,
  readRecords,
  openHealthConnectSettings as openSystemSettings,
  aggregateRecord,
} from "react-native-health-connect";
import type { BloodPressureReading, HeartRateSample, VitalType } from "../vitals/types";

export type HealthConnectSleepSession = {
  startTime: string;
  endTime: string;
  durationHours: number;
};

export type HealthConnectExerciseSession = {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  exerciseType: number;
};

export type HealthConnectWeightSample = {
  time: string;
  weightKg: number;
};

// Android-only — Health Connect has no iOS equivalent, so every call here is
// a no-op (matching the module's shape) on other platforms.
const IS_SUPPORTED = Platform.OS === "android";

// What the sync reads. Steps isn't asked for — nothing in the app reads it.
// Each one is optional: whichever the user grants is synced, the rest skipped.
const REQUIRED_PERMISSIONS = [
  { accessType: "read" as const, recordType: "SleepSession" as const },
  { accessType: "read" as const, recordType: "ExerciseSession" as const },
  { accessType: "read" as const, recordType: "Weight" as const },
];

export type SyncedRecordType = (typeof REQUIRED_PERMISSIONS)[number]["recordType"];

function grantedTypes(granted: { accessType: string; recordType: string }[]): Set<SyncedRecordType> {
  return new Set(
    REQUIRED_PERMISSIONS.filter((required) =>
      granted.some((g) => g.accessType === required.accessType && g.recordType === required.recordType),
    ).map((required) => required.recordType),
  );
}

const HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata";

let initialized = false;

async function ensureInitialized(): Promise<boolean> {
  if (initialized) return true;
  initialized = await initialize();
  return initialized;
}

// SDK_UNAVAILABLE / SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED both mean "no
// usable Health Connect on this device" from this app's point of view — on
// Android 13 and below that's because the separate Play Store app isn't
// installed (or needs an update); on Android 14+ it's part of the OS.
export async function isAvailable(): Promise<boolean> {
  if (!IS_SUPPORTED) return false;
  const status = await getSdkStatus(HEALTH_CONNECT_PACKAGE);
  return status === SdkAvailabilityStatus.SDK_AVAILABLE;
}

export function openHealthConnectInPlayStore(): void {
  if (!IS_SUPPORTED) return;
  const marketUrl = `market://details?id=${HEALTH_CONNECT_PACKAGE}`;
  const webUrl = `https://play.google.com/store/apps/details?id=${HEALTH_CONNECT_PACKAGE}`;
  Linking.openURL(marketUrl).catch(() => Linking.openURL(webUrl).catch(() => {}));
}

// Which of Sleep / Exercise / Weight the user has granted read access to.
export async function getGrantedRecordTypes(): Promise<Set<SyncedRecordType>> {
  if (!IS_SUPPORTED) return new Set();
  if (!(await ensureInitialized())) return new Set();
  return grantedTypes(await getGrantedPermissions());
}

// True when at least one synced type is granted — one denial no longer
// turns the whole sync off.
export async function hasPermissions(): Promise<boolean> {
  return (await getGrantedRecordTypes()).size > 0;
}

// Triggers the Health Connect system permission dialog listing Sleep,
// Exercise and Weight — true if the user granted at least one of them.
export async function requestPermissions(): Promise<boolean> {
  if (!IS_SUPPORTED) return false;
  if (!(await ensureInitialized())) return false;
  return grantedTypes(await requestPermission(REQUIRED_PERMISSIONS)).size > 0;
}

export async function readSleepSessions(from: string, to: string): Promise<HealthConnectSleepSession[]> {
  if (!IS_SUPPORTED) return [];
  const records = await readAllPages("SleepSession", from, to);
  return records.map((r) => ({
    startTime: r.startTime,
    endTime: r.endTime,
    durationHours: (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 3_600_000,
  }));
}

export async function readExerciseSessions(from: string, to: string): Promise<HealthConnectExerciseSession[]> {
  if (!IS_SUPPORTED) return [];
  const records = await readAllPages("ExerciseSession", from, to);
  return records.map((r) => ({
    startTime: r.startTime,
    endTime: r.endTime,
    durationMinutes: (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60_000,
    exerciseType: r.exerciseType,
  }));
}

export async function readWeights(from: string, to: string): Promise<HealthConnectWeightSample[]> {
  if (!IS_SUPPORTED) return [];
  const records = await readAllPages("Weight", from, to);
  return records.map((r) => ({
    time: r.time,
    weightKg: r.weight.inKilograms,
  }));
}

// ── Heart rate + blood pressure (lib/vitals) ────────────────────────────────
// A separate request from Sleep / Exercise / Weight: it's only made after the
// vitals consent screen, for accounts allowed to share health data. No
// history or background-read permission is asked for.
const VITALS_PERMISSIONS = [
  { accessType: "read" as const, recordType: "HeartRate" as const },
  { accessType: "read" as const, recordType: "RestingHeartRate" as const },
  { accessType: "read" as const, recordType: "BloodPressure" as const },
];

function grantedVitals(granted: { accessType: string; recordType: string }[]): Set<VitalType> {
  return new Set(
    VITALS_PERMISSIONS.filter((p) => granted.some((g) => g.accessType === p.accessType && g.recordType === p.recordType)).map(
      (p) => p.recordType,
    ),
  );
}

export async function getGrantedVitalTypes(): Promise<Set<VitalType>> {
  if (!IS_SUPPORTED) return new Set();
  if (!(await ensureInitialized())) return new Set();
  return grantedVitals(await getGrantedPermissions());
}

export async function requestVitalsPermissions(): Promise<Set<VitalType>> {
  if (!IS_SUPPORTED) return new Set();
  if (!(await ensureInitialized())) return new Set();
  return grantedVitals(await requestPermission(VITALS_PERMISSIONS));
}

// Health Connect pages large reads (a watch writes HR all day); every page
// is fetched, following pageToken until there's none. Used for sleep /
// exercise / weight too (they used to read only the first page).
async function readAllPages<T extends SyncedRecordType | "HeartRate" | "RestingHeartRate" | "BloodPressure">(recordType: T, from: string, to: string) {
  const all = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(recordType, {
      timeRangeFilter: { operator: "between", startTime: from, endTime: to },
      ...(pageToken ? { pageToken } : {}),
    });
    all.push(...page.records);
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return all;
}

export async function readHeartRateSamples(from: string, to: string): Promise<HeartRateSample[]> {
  if (!IS_SUPPORTED) return [];
  const records = await readAllPages("HeartRate", from, to);
  return records.flatMap((r) =>
    r.samples.map((s) => ({ time: s.time, bpm: s.beatsPerMinute, origin: r.metadata?.dataOrigin ?? "" })),
  );
}

export async function readRestingHeartRate(from: string, to: string): Promise<HeartRateSample[]> {
  if (!IS_SUPPORTED) return [];
  const records = await readAllPages("RestingHeartRate", from, to);
  return records.map((r) => ({ time: r.time, bpm: r.beatsPerMinute, origin: r.metadata?.dataOrigin ?? "" }));
}

export async function readBloodPressure(from: string, to: string): Promise<BloodPressureReading[]> {
  if (!IS_SUPPORTED) return [];
  const records = await readAllPages("BloodPressure", from, to);
  return records.map((r) => ({
    id: r.metadata?.id ?? `${r.time}|${r.systolic.inMillimetersOfMercury}|${r.diastolic.inMillimetersOfMercury}`,
    time: r.time,
    systolic: r.systolic.inMillimetersOfMercury,
    diastolic: r.diastolic.inMillimetersOfMercury,
    bodyPosition: r.bodyPosition ?? null,
    measurementLocation: r.measurementLocation ?? null,
    origin: r.metadata?.dataOrigin ?? "",
  }));
}

// Health Connect's own settings, where the user revokes access.
export function openHealthConnectSettings(): void {
  if (!IS_SUPPORTED) return;
  openSystemSettings();
}

// ── "Connect your watch" (lib/watch) ─────────────────────────────────────────
// Every type in ONE permission request (heart rate / BP only when the account
// may use them), instead of the two separate requests above.
const ALL_TYPES = [...REQUIRED_PERMISSIONS, ...VITALS_PERMISSIONS];

function grantedOf(granted: { accessType: string; recordType: string }[]): Set<string> {
  return new Set(
    ALL_TYPES.filter((p) => granted.some((g) => g.accessType === p.accessType && g.recordType === p.recordType)).map((p) => p.recordType),
  );
}

export async function requestAllPermissions(includeVitals: boolean): Promise<Set<string>> {
  if (!IS_SUPPORTED) return new Set();
  if (!(await ensureInitialized())) return new Set();
  const asked = includeVitals ? ALL_TYPES : REQUIRED_PERMISSIONS;
  return grantedOf(await requestPermission(asked));
}

export async function getGrantedAllTypes(): Promise<Set<string>> {
  if (!IS_SUPPORTED) return new Set();
  if (!(await ensureInitialized())) return new Set();
  return grantedOf(await getGrantedPermissions());
}

// Which apps wrote this type into Health Connect in the range (an aggregate
// only — no records are read). Needs read permission for the type; any error
// counts as "nobody".
export async function recentWriters(
  recordType: "HeartRate" | "BloodPressure" | "SleepSession",
  from: string,
  to: string,
): Promise<string[]> {
  if (!IS_SUPPORTED) return [];
  try {
    const result = await aggregateRecord({ recordType, timeRangeFilter: { operator: "between", startTime: from, endTime: to } });
    return result.dataOrigins ?? [];
  } catch {
    return [];
  }
}

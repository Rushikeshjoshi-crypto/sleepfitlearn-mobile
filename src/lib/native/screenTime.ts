import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export type ScreenTimeAppUsage = {
  packageName: string;
  appName: string;
  minutesUsed: number;
};

export type ScreenTimeTodaySummary = {
  totalMinutes: number;
  apps: ScreenTimeAppUsage[];
  trackingEnabled: boolean;
  lastSyncAt: number;
};

// One local day of unsynced usage — the native store buckets pending minutes
// by the day they were used (ScreenTimeStore / PendingDays.kt).
export type ScreenTimePendingDay = {
  date: string;
  totalMinutes: number;
  apps: ScreenTimeAppUsage[];
};

export type ScreenTimePendingSync = { days: ScreenTimePendingDay[] };

// One local day from Android's own usage record (ScreenTimeModule.getDailyUsage):
// available false = Android has no data for that day; final = the day is over.
export type ScreenTimeDailyUsage = ScreenTimePendingDay & { available: boolean; final: boolean };

// Android-only — there is no iOS equivalent of UsageStatsManager, so every
// call here is a no-op (matching the native module's shape) on other platforms.
const IS_SUPPORTED = Platform.OS === "android";

const native = NativeModules.ScreenTimeModule as
  | {
      hasUsageAccessPermission(): Promise<boolean>;
      openUsageAccessSettings(): void;
      requestIgnoreBatteryOptimizations(): void;
      startTracking(): void;
      stopTracking(): void;
      isTracking(): Promise<boolean>;
      getTodaySummary(): Promise<ScreenTimeTodaySummary>;
      takePendingSync(): Promise<ScreenTimePendingSync | null>;
      restorePendingSync(date: string | null, totalMinutes: number, apps: ScreenTimeAppUsage[]): void;
      markSyncSucceeded(): void;
      getDailyUsage(days: number): Promise<ScreenTimeDailyUsage[]>;
      addListener(eventName: string): void;
      removeListeners(count: number): void;
    }
  | undefined;

export const SCREEN_TIME_SYNC_DUE_EVENT = "ScreenTimeSyncDue";

export async function hasUsageAccessPermission(): Promise<boolean> {
  if (!IS_SUPPORTED || !native) return false;
  return native.hasUsageAccessPermission();
}

export function openUsageAccessSettings(): void {
  if (!IS_SUPPORTED || !native) return;
  native.openUsageAccessSettings();
}

export function requestIgnoreBatteryOptimizations(): void {
  if (!IS_SUPPORTED || !native) return;
  native.requestIgnoreBatteryOptimizations();
}

export function startTracking(): void {
  if (!IS_SUPPORTED || !native) return;
  native.startTracking();
}

export function stopTracking(): void {
  if (!IS_SUPPORTED || !native) return;
  native.stopTracking();
}

export async function isTracking(): Promise<boolean> {
  if (!IS_SUPPORTED || !native) return false;
  return native.isTracking();
}

export async function getTodaySummary(): Promise<ScreenTimeTodaySummary | null> {
  if (!IS_SUPPORTED || !native) return null;
  return native.getTodaySummary();
}

// Atomically reads AND clears the unsynced delta in one native call — see
// ScreenTimeStore.takePending() (Kotlin) for why this replaced the old
// getPendingSync (peek) + confirmSyncFlushed (clear-after-success) pair: that
// split left a window where a second overlapping sync trigger could read the
// same not-yet-cleared delta and POST it again.
export async function takePendingSync(): Promise<ScreenTimePendingSync | null> {
  if (!IS_SUPPORTED || !native) return null;
  return native.takePendingSync();
}

// Hands a taken-but-failed-to-POST day back so it isn't lost — merged back
// into that day's pending bucket, to be picked up by the next sync attempt.
export function restorePendingSync(date: string | null, totalMinutes: number, apps: ScreenTimeAppUsage[]): void {
  if (!IS_SUPPORTED || !native) return;
  native.restorePendingSync(date, totalMinutes, apps);
}

// Records lastSyncAt (shown on the Habits screen) — only after every taken
// day's POST succeeded, never merely on taking.
export function markSyncSucceeded(): void {
  if (!IS_SUPPORTED || !native) return;
  native.markSyncSucceeded();
}

// Best-effort push notification that a sync is due; register once at app
// entry (see index.js) since a listener registered inside a screen component
// unsubscribes when that screen unmounts.
export function onSyncDue(callback: () => void): () => void {
  if (!IS_SUPPORTED || !native) return () => {};
  const emitter = new NativeEventEmitter(native as unknown as ConstructorParameters<typeof NativeEventEmitter>[0]);
  const subscription = emitter.addListener(SCREEN_TIME_SYNC_DUE_EVENT, callback);
  return () => subscription.remove();
}

// The last `days` local days (oldest first) recomputed from Android's usage
// events — including days the app was never opened. Empty when unsupported.
export async function getDailyUsage(days: number): Promise<ScreenTimeDailyUsage[]> {
  if (!IS_SUPPORTED || !native) return [];
  return native.getDailyUsage(days);
}

import {
  createVitalsMetric,
  deleteHealthMetricRow,
  listHealthMetricsInRange,
  updateVitalsMetric,
  type HealthMetric,
} from "../api/fitness";
import { getCurrentUserId } from "../aws/cognito";
import { isBackgroundSyncAllowed } from "../syncGate";
import { dailyHeartRate, dedupeBloodPressure, localDayOf, type DailyHeartRate } from "./aggregate";
import { checkVitalsAccess } from "./eligibility";
import { healthConnectVitals } from "./healthConnectSource";
import { getVitalsState, setVitalsEnabled, setVitalsLastSync } from "./preference";
import type { BloodPressureMeta, HeartRateDailyMeta, VitalsSource } from "./types";
import { vitalsSyncWindow } from "./window";

// A health_metrics row this sync wrote (manual rows have no meta.source).
export function isSyncedVitalsRow(row: Pick<HealthMetric, "metric_type" | "meta">): boolean {
  return (
    (row.metric_type === "heart_rate" || row.metric_type === "blood_pressure") &&
    (row.meta as { source?: unknown } | null | undefined)?.source === "health_connect"
  );
}

function heartRateMeta(day: DailyHeartRate): HeartRateDailyMeta {
  return {
    source: "health_connect",
    min: day.min,
    max: day.max,
    avg: day.avg,
    resting: day.resting,
    samples: day.samples,
    origins: day.origins,
  };
}

// Field by field: DynamoDB doesn't keep a map's key order.
function sameHeartRate(stored: unknown, next: HeartRateDailyMeta): boolean {
  const s = stored as Partial<HeartRateDailyMeta> | null;
  if (!s) return false;
  return (
    s.min === next.min && s.max === next.max && s.avg === next.avg && s.resting === next.resting &&
    s.samples === next.samples && (s.origins ?? []).join("|") === next.origins.join("|")
  );
}

let inFlight: Promise<void> | null = null;

// Runs only when ALL of these hold: the account passed ProfileGate (syncGate),
// the user consented and switched it on, and the account may share health
// data (adults / no birth year; 13–17 only with minor_data_enabled — checked
// live, fails closed). Never touches a manual entry.
export function syncVitals(source: VitalsSource = healthConnectVitals, now: Date = new Date()): Promise<void> {
  if (!isBackgroundSyncAllowed()) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = run(source, now).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(source: VitalsSource, now: Date): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const state = await getVitalsState(userId);
  if (!state.enabled || !state.consent) return;
  if (!(await checkVitalsAccess()).allowed) return;
  const granted = await source.grantedTypes();
  if (granted.size === 0) return;

  const { from, to } = vitalsSyncWindow(state.lastSyncAt, now);
  const existing = (await listHealthMetricsInRange({ from: localDayOf(from), to: localDayOf(to) })).filter(isSyncedVitalsRow);
  let failed = false;
  const attempt = async (label: string, write: () => Promise<unknown>) => {
    try {
      await write();
    } catch (err) {
      failed = true;
      console.warn(`Vitals sync: couldn't save ${label}`, err);
    }
  };

  if (granted.has("HeartRate") || granted.has("RestingHeartRate")) {
    const [samples, resting] = await Promise.all([
      granted.has("HeartRate") ? source.readHeartRate(from, to) : Promise.resolve([]),
      granted.has("RestingHeartRate") ? source.readRestingHeartRate(from, to) : Promise.resolve([]),
    ]);
    for (const day of dailyHeartRate(samples, resting)) {
      const value = day.avg ?? day.resting;
      if (value == null) continue;
      const meta = heartRateMeta(day);
      const row = existing.find((r) => r.metric_type === "heart_rate" && r.measured_at === day.date);
      if (row && sameHeartRate(row.meta, meta)) continue;
      await attempt(`heart rate ${day.date}`, () =>
        row
          ? updateVitalsMetric(row.sk, day.date, "heart_rate", value, meta)
          : createVitalsMetric(day.date, "heart_rate", value, meta),
      );
    }
  }

  if (granted.has("BloodPressure")) {
    const saved = new Set(
      existing
        .filter((r) => r.metric_type === "blood_pressure")
        .flatMap((r) => (r.meta as Partial<BloodPressureMeta> | null)?.hc_ids ?? []),
    );
    for (const reading of dedupeBloodPressure(await source.readBloodPressure(from, to))) {
      if (reading.ids.some((id) => saved.has(id))) continue;
      const meta: BloodPressureMeta = {
        source: "health_connect",
        systolic: reading.systolic,
        diastolic: reading.diastolic,
        time: reading.time,
        body_position: reading.bodyPosition,
        measurement_location: reading.measurementLocation,
        origins: reading.origins,
        hc_ids: reading.ids,
      };
      await attempt(`blood pressure ${reading.time}`, () =>
        createVitalsMetric(localDayOf(reading.time), "blood_pressure", reading.systolic, meta),
      );
    }
  }

  // Only a fully successful sync moves the window; anything that failed is
  // read again next time.
  if (!failed) await setVitalsLastSync(userId, now.toISOString());
}

// "Delete my synced heart rate & BP": removes the rows this sync wrote from
// OUR server only (Health Connect keeps its own copy) and turns syncing off
// so they don't come straight back. Manual entries stay. Returns how many
// rows were removed.
export async function deleteSyncedVitals(userId: string): Promise<number> {
  await setVitalsEnabled(userId, false);
  await setVitalsLastSync(userId, null);
  const rows = (await listHealthMetricsInRange()).filter(isSyncedVitalsRow);
  for (const row of rows) await deleteHealthMetricRow(row.sk);
  return rows.length;
}

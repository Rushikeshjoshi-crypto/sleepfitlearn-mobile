import type { BloodPressureMeta, HeartRateDailyMeta } from "../vitals/types";
import { apiGet, apiPost, apiPut, apiDelete } from "./client";
import { dateFromSk, queueEnergySync } from "../energy/sync";
import type { ExerciseActivityPart } from "../exercise/combine";

// Mirrors the web app's src/lib/api/fitness.ts.

export type ExerciseEntry = {
  id: string;
  sk: string;
  event_date: string;
  activity_type_id: string | null;
  custom_activity_name?: string | null;
  duration_minutes: number | null;
  intensity: string | null;
  notes: string | null;
  created_at?: string;
  // Set on a row built by "Combine" — per-activity minutes summing to
  // duration_minutes (see lib/exercise/combine.ts). Absent on older rows.
  activities?: ExerciseActivityPart[] | null;
};

// "single" = always a new row (also what no mode means — older clients).
// "combine" = add to the newest row for the same date + activity, if any
// (see lib/exercise/combine.ts); the response then has combined: true.
export type ExerciseLogMode = "single" | "combine";

export type ExerciseInput = {
  event_date: string;
  activity_type_id?: string | null;
  custom_activity_name?: string | null;
  duration_minutes?: number | null;
  intensity?: string | null;
  notes?: string | null;
  mode?: ExerciseLogMode;
};

export type ExerciseCreateResult = ExerciseEntry & { combined?: boolean };

// event_date is always sent on update, unlike Study's (matches the web app's contract).
export type ExerciseUpdate = {
  event_date: string;
  activity_type_id?: string | null;
  custom_activity_name?: string | null;
  duration_minutes?: number | null;
  intensity?: string | null;
  notes?: string | null;
};

export type ActivityType = {
  id: string;
  name_i18n: { en: string; [locale: string]: string | undefined };
  category: string;
};

export type CustomActivity = {
  id: string;
  slot: number;
  name: string;
};

export function listExerciseEntries(range?: { from: string; to: string }): Promise<ExerciseEntry[]> {
  return apiGet<ExerciseEntry[]>("fitness", "exercise", range);
}

// Every exercise write also recalculates that date's energy level (see lib/energy).
export async function createExerciseEntry(input: ExerciseInput): Promise<ExerciseCreateResult> {
  const entry = await apiPost<ExerciseCreateResult>("fitness", "exercise", input);
  queueEnergySync(input.event_date);
  return entry;
}

// `sk` contains a "#" and must be encoded before it reaches the URL.
export async function updateExerciseEntry(sk: string, input: ExerciseUpdate): Promise<ExerciseEntry> {
  const entry = await apiPut<ExerciseEntry>("fitness", `exercise/${encodeURIComponent(sk)}`, input);
  queueEnergySync(dateFromSk(sk), input.event_date);
  return entry;
}

export async function deleteExerciseEntry(sk: string): Promise<void> {
  await apiDelete("fitness", `exercise/${encodeURIComponent(sk)}`);
  queueEnergySync(dateFromSk(sk));
}

// Global lookup table, not per-user — fetch once per session.
export function listActivityTypes(): Promise<ActivityType[]> {
  return apiGet<ActivityType[]>("fitness", "activity-types");
}

// Fixed 5-slot system per user.
export function listCustomActivities(): Promise<CustomActivity[]> {
  return apiGet<CustomActivity[]>("fitness", "custom-activities");
}

// Upsert-by-slot: renaming a slot that already has a name keeps the same id.
export function upsertCustomActivity(slot: number, name: string): Promise<CustomActivity> {
  return apiPost<CustomActivity>("fitness", "custom-activities", { slot, name });
}

export function deleteCustomActivity(slot: number): Promise<void> {
  return apiDelete("fitness", `custom-activities/${slot}`);
}

// --- Personal metrics (weight + health) ------------------------------------

export type WeightEntry = {
  id: string;
  sk: string;
  recorded_date: string;
  weight_kg: number;
};

export type HealthMetric = {
  id: string;
  sk: string;
  measured_at: string;
  metric_type: string;
  value: number;
  unit: string;
  // Set on rows synced from Health Connect (lib/vitals); manual rows have none.
  meta?: Record<string, unknown> | null;
};

export type SimpleMetricType = "heart_rate" | "waist_cm" | "chin_ups" | "bench_press" | "height_cm" | "energy_level";
const SIMPLE_METRIC_TYPES: readonly string[] = ["heart_rate", "waist_cm", "chin_ups", "bench_press", "height_cm", "energy_level"];
function isSimpleMetricType(type: string): type is SimpleMetricType {
  return SIMPLE_METRIC_TYPES.includes(type);
}

// energy_level is calculated from sleep + workout (lib/energy, same formula
// as the web app) and never entered by hand — `computed` keeps it out of the
// log/edit form.
export const METRIC_META: Record<SimpleMetricType, { label: string; unit: string; min: number; max: number; integer?: boolean; computed?: boolean }> = {
  heart_rate: { label: "Heart rate", unit: "bpm", min: 20, max: 250 },
  waist_cm: { label: "Waist", unit: "cm", min: 30, max: 250 },
  chin_ups: { label: "Chin-ups", unit: "reps", min: 0, max: 200, integer: true },
  bench_press: { label: "Bench press", unit: "kg", min: 0, max: 500 },
  height_cm: { label: "Height", unit: "cm", min: 30, max: 260 },
  energy_level: { label: "Energy level", unit: "/ 100", min: 0, max: 100, integer: true, computed: true },
};
export const WEIGHT_META = { label: "Weight", unit: "kg", min: 20, max: 400 };

// Same bounds as the web form (and the backend's weight_kg check is wider).
export function isWeightInRange(kg: number): boolean {
  return Number.isFinite(kg) && kg >= WEIGHT_META.min && kg <= WEIGHT_META.max;
}
export const BP_META = { label: "Blood pressure", unit: "mmHg" };

export function listWeights(range?: { from: string; to: string }): Promise<WeightEntry[]> {
  return apiGet<WeightEntry[]>("fitness", "weights", range);
}

function createWeightRow(recordedDate: string, weightKg: number): Promise<WeightEntry> {
  return apiPost<WeightEntry>("fitness", "weights", { recorded_date: recordedDate, weight_kg: weightKg });
}

function updateWeightRow(sk: string, recordedDate: string, weightKg: number): Promise<WeightEntry> {
  return apiPut<WeightEntry>("fitness", `weights/${encodeURIComponent(sk)}`, {
    recorded_date: recordedDate,
    weight_kg: weightKg,
  });
}

function deleteWeightRow(sk: string): Promise<void> {
  return apiDelete("fitness", `weights/${encodeURIComponent(sk)}`);
}

function listHealthMetrics(range?: { from: string; to: string }): Promise<HealthMetric[]> {
  return apiGet<HealthMetric[]>("fitness", "health", range);
}

function createHealthMetric(
  measuredAt: string,
  metricType: string,
  value: number,
  unit: string,
  meta?: object,
): Promise<HealthMetric> {
  return apiPost<HealthMetric>("fitness", "health", { measured_at: measuredAt, metric_type: metricType, value, unit, ...(meta && { meta }) });
}

function updateHealthMetric(
  sk: string,
  measuredAt: string,
  metricType: string,
  value: number,
  unit: string,
  meta?: object,
): Promise<HealthMetric> {
  return apiPut<HealthMetric>("fitness", `health/${encodeURIComponent(sk)}`, {
    measured_at: measuredAt,
    metric_type: metricType,
    value,
    unit,
    ...(meta && { meta }),
  });
}

// Heart rate (one row per day) and blood pressure (one row per reading)
// synced from Health Connect — see lib/vitals/sync.ts. `meta.source` marks
// them apart from manual entries.
export type VitalsMetricType = "heart_rate" | "blood_pressure";
const VITALS_UNIT: Record<VitalsMetricType, string> = { heart_rate: "bpm", blood_pressure: "mmHg" };

export function listHealthMetricsInRange(range?: { from: string; to: string }): Promise<HealthMetric[]> {
  return listHealthMetrics(range);
}

export function createVitalsMetric(date: string, type: VitalsMetricType, value: number, meta: object): Promise<HealthMetric> {
  return createHealthMetric(date, type, value, VITALS_UNIT[type], meta);
}

export function updateVitalsMetric(
  sk: string,
  date: string,
  type: VitalsMetricType,
  value: number,
  meta: object,
): Promise<HealthMetric> {
  return updateHealthMetric(sk, date, type, value, VITALS_UNIT[type], meta);
}

// A heart rate measured with the phone camera (lib/heartCamera): an ordinary
// heart_rate row marked meta.source "camera" — so it's never treated as a
// Health Connect row (sync, delete) and is shown with a Camera badge.
export type CameraHeartRateInfo = { quality: "good" | "fair"; seconds: number };

export function createCameraHeartRate(date: string, bpm: number, quality: "good" | "fair", seconds: number): Promise<HealthMetric> {
  return createHealthMetric(date, "heart_rate", bpm, METRIC_META.heart_rate.unit, { source: "camera", quality, seconds });
}

export function deleteHealthMetricRow(sk: string): Promise<void> {
  return deleteHealthMetric(sk);
}

function deleteHealthMetric(sk: string): Promise<void> {
  return apiDelete("fitness", `health/${encodeURIComponent(sk)}`);
}

// ── Daily steps ─────────────────────────────────────────────────────────────
// One health_metrics row per local day (sk "{date}#steps"), written only via
// PUT fitness/steps/{date} — an upsert, so it never makes a second row for a
// day. A Health Connect write never replaces a day typed in by hand: the
// server answers { skipped: "manual_entry" } instead.
export type StepsMeta = {
  source: "health_connect" | "manual";
  origins?: string[];
  tz?: string;
  synced_at?: string;
};

export type DailySteps = Omit<HealthMetric, "meta"> & { meta?: StepsMeta | null };

export type UpsertStepsResult = DailySteps | { skipped: "manual_entry"; date: string };

export function upsertDailySteps(date: string, value: number, meta: StepsMeta): Promise<UpsertStepsResult> {
  return apiPut<UpsertStepsResult>("fitness", `steps/${date}`, { value, meta });
}

export function listDailySteps(range?: { from: string; to: string }): Promise<DailySteps[]> {
  return apiGet<DailySteps[]>("fitness", "steps", range);
}

export function deleteDailySteps(date: string): Promise<void> {
  return apiDelete("fitness", `steps/${date}`);
}

// Weight is dual-written to /weights and /health so it shows up both in the
// dedicated weight endpoint and in the generic health-metric feed — mirrors
// the web app's behavior exactly (see listPersonalEntries' dedupe below).
//
// Written in order, never half-saved: /weights first (if it fails, /health is
// never written); if /health then fails, the /weights row is removed again.
// (Promise.all used to leave one side saved when the other was refused.)
export async function createWeightEntry(date: string, weightKg: number): Promise<void> {
  const row = await createWeightRow(date, weightKg);
  try {
    await createHealthMetric(date, "weight", weightKg, WEIGHT_META.unit);
  } catch (err) {
    if (row?.sk) await deleteWeightRow(row.sk).catch(() => {});
    throw err;
  }
}

export async function updateWeightEntry(
  source: "health" | "weights",
  sk: string,
  date: string,
  weightKg: number,
): Promise<void> {
  if (source === "health") {
    await updateHealthMetric(sk, date, "weight", weightKg, WEIGHT_META.unit);
  } else {
    await updateWeightRow(sk, date, weightKg);
  }
}

export async function deleteWeightEntry(source: "health" | "weights", sk: string): Promise<void> {
  if (source === "health") await deleteHealthMetric(sk);
  else await deleteWeightRow(sk);
}

// Blood pressure is two linked /health rows sharing one measured_at.
export async function createBpEntry(date: string, systolic: number, diastolic: number): Promise<void> {
  await Promise.all([
    createHealthMetric(date, "bp_systolic", systolic, BP_META.unit),
    createHealthMetric(date, "bp_diastolic", diastolic, BP_META.unit),
  ]);
}

export async function updateBpEntry(
  date: string,
  systolic: number,
  diastolic: number,
  sysSk: string,
  diaSk: string,
): Promise<void> {
  await Promise.all([
    updateHealthMetric(sysSk, date, "bp_systolic", systolic, BP_META.unit),
    updateHealthMetric(diaSk, date, "bp_diastolic", diastolic, BP_META.unit),
  ]);
}

// A Health Connect reading is one row (sysSk === diaSk).
export async function deleteBpEntry(sysSk: string, diaSk: string): Promise<void> {
  if (sysSk === diaSk) await deleteHealthMetric(sysSk);
  else await Promise.all([deleteHealthMetric(sysSk), deleteHealthMetric(diaSk)]);
}

export function createSimpleMetricEntry(kind: SimpleMetricType, date: string, value: number): Promise<HealthMetric> {
  return createHealthMetric(date, kind, value, METRIC_META[kind].unit);
}

export function updateSimpleMetricEntry(
  kind: SimpleMetricType,
  sk: string,
  date: string,
  value: number,
): Promise<HealthMetric> {
  return updateHealthMetric(sk, date, kind, value, METRIC_META[kind].unit);
}

export function deleteSimpleMetricEntry(sk: string): Promise<void> {
  return deleteHealthMetric(sk);
}

export type PersonalEntry =
  // unit: the stored one (older energy rows were typed in on a 1-5 scale).
  // vitals: set when the row came from Health Connect (read-only in the UI).
  | {
      kind: "weight" | SimpleMetricType;
      date: string;
      value: number;
      source: "health" | "weights";
      sk: string;
      unit?: string;
      vitals?: HeartRateDailyMeta;
      // Measured with the phone camera (createCameraHeartRate).
      camera?: CameraHeartRateInfo;
    }
  | { kind: "bp"; date: string; systolic: number; diastolic: number; sysSk: string; diaSk: string; vitals?: BloodPressureMeta };

const isSyncedMeta = (meta: HealthMetric["meta"]) => (meta as { source?: unknown } | null | undefined)?.source === "health_connect";

// Merges /health + /weights, dropping a /weights row whenever a same-date
// /health "weight" row already covers it (handles legacy pre-dual-write data
// without showing duplicate weight entries) — same rule the web app uses.
export async function listPersonalEntries(range: { from: string; to: string }): Promise<PersonalEntry[]> {
  const [metrics, weights] = await Promise.all([listHealthMetrics(range), listWeights(range)]);

  const entries: PersonalEntry[] = [];
  const healthWeightDates = new Set<string>();
  const bpByDate = new Map<string, { systolic?: HealthMetric; diastolic?: HealthMetric }>();

  for (const m of metrics) {
    if (m.metric_type === "weight") {
      healthWeightDates.add(m.measured_at);
      entries.push({ kind: "weight", date: m.measured_at, value: m.value, source: "health", sk: m.sk });
    } else if (m.metric_type === "blood_pressure" && isSyncedMeta(m.meta)) {
      const meta = m.meta as unknown as BloodPressureMeta;
      entries.push({
        kind: "bp",
        date: m.measured_at,
        systolic: meta.systolic,
        diastolic: meta.diastolic,
        sysSk: m.sk,
        diaSk: m.sk,
        vitals: meta,
      });
    } else if (m.metric_type === "bp_systolic" || m.metric_type === "bp_diastolic") {
      const bucket = bpByDate.get(m.measured_at) ?? {};
      if (m.metric_type === "bp_systolic") bucket.systolic = m;
      else bucket.diastolic = m;
      bpByDate.set(m.measured_at, bucket);
    } else if (isSimpleMetricType(m.metric_type)) {
      // Types this app has no label/unit for (e.g. logged by another client)
      // are skipped instead of rendering broken rows.
      entries.push({
        kind: m.metric_type,
        date: m.measured_at,
        value: m.value,
        source: "health",
        sk: m.sk,
        unit: m.unit,
        ...(m.metric_type === "heart_rate" && isSyncedMeta(m.meta) && { vitals: m.meta as unknown as HeartRateDailyMeta }),
        ...(m.metric_type === "heart_rate" && (m.meta as { source?: unknown } | null | undefined)?.source === "camera" && {
          camera: {
            quality: (m.meta as { quality?: "good" | "fair" }).quality ?? "fair",
            seconds: Number((m.meta as { seconds?: number }).seconds ?? 0),
          },
        }),
      });
    }
  }

  for (const [date, bucket] of bpByDate) {
    if (bucket.systolic && bucket.diastolic) {
      entries.push({
        kind: "bp",
        date,
        systolic: bucket.systolic.value,
        diastolic: bucket.diastolic.value,
        sysSk: bucket.systolic.sk,
        diaSk: bucket.diastolic.sk,
      });
    }
  }

  for (const w of weights) {
    if (!healthWeightDates.has(w.recorded_date)) {
      entries.push({ kind: "weight", date: w.recorded_date, value: w.weight_kg, source: "weights", sk: w.sk });
    }
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

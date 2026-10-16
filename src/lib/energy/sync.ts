import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import { calculateEnergy, type EnergyResult, type EnergyWorkoutInput } from "./calculate";

// Byte-identical in the web and mobile apps (src/lib/energy/ in both) — edit
// both together; each repo's tests check the formula and the sync.
// Talks to the API through the bare client (not lib/api/sleep or
// lib/api/fitness) because those modules call syncEnergyForDate after every
// write — importing them here would be a cycle.

export const ENERGY_QUERY_KEY = ["energy"] as const;
export const ENERGY_METRIC_TYPE = "energy_level";
export const ENERGY_UNIT = "/ 100";
// Marker row (value 1) for "I'm resting today on purpose" — scores 70 instead
// of counting as a missing workout. Not shown in the Personal timeline.
export const REST_DAY_METRIC_TYPE = "rest_day";

type SleepRow = {
  sk: string;
  sleep_date: string;
  duration_hours: number | null;
  notes?: string | null;
  created_at?: string;
};

// One night = one row, the same one the dashboard / insights / family summary
// count (backend shared/dailyRows.js preferredSleepEntry): the newest manual
// row, otherwise the newest Health Connect row. Summing every row on the date
// counted a re-logged night (or a manual + synced pair) twice.
const HC_NOTE_MARKER = "Synced from Health Connect";

function isNewerRow(a: SleepRow, b: SleepRow | null): boolean {
  if (!b) return true;
  const ca = a.created_at ?? "";
  const cb = b.created_at ?? "";
  if (ca !== cb) return ca > cb;
  return a.sk > b.sk;
}

export function preferredSleepRow<T extends SleepRow>(rows: T[]): T | null {
  let manual: T | null = null;
  let synced: T | null = null;
  for (const r of rows) {
    if (r.notes === HC_NOTE_MARKER) {
      if (isNewerRow(r, synced)) synced = r;
    } else if (isNewerRow(r, manual)) {
      manual = r;
    }
  }
  return manual ?? synced;
}
type ExerciseRow = { sk: string; event_date: string; duration_minutes: number | null; intensity: string | null };
type HealthRow = { sk: string; measured_at: string; metric_type: string; value: number; unit: string; meta?: EnergyMeta };

// The sleep/workout references a stored score was calculated from.
export type EnergyMeta = {
  basis: EnergyResult["basis"];
  sleep_score: number | null;
  workout_score: number | null;
  sleep_hours: number | null;
  workout_minutes: number | null;
  rest_day: boolean;
  sleep_sks: string[];
  exercise_sks: string[];
};

export type EnergySnapshot = {
  date: string;
  result: EnergyResult;
  sleepHours: number | null;
  workoutMinutes: number | null;
  restDay: boolean;
  restDaySk: string | null;
  hasWorkoutEntries: boolean;
};

// Every sk in this app is "<YYYY-MM-DD>#<suffix>".
export function dateFromSk(sk: string): string {
  return sk.split("#")[0].slice(0, 10);
}

// "YYYY-MM-DD" moved by whole calendar days (noon, so DST never skips a day).
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// A day's energy uses the night BEFORE it: a night's sleep_date is the evening
// it started ("Last night" = yesterday), so today's energy = last night's
// sleep + today's workout. Sleep writes re-sync this date, not the sleep_date.
export function energyDateForSleep(sleepDate: string): string {
  return shiftDate(sleepDate, 1);
}

async function loadDay(date: string) {
  const range = { from: date, to: date };
  const night = shiftDate(date, -1);
  const [sleep, exercise, health] = await Promise.all([
    apiGet<SleepRow[]>("sleep", "", { from: night, to: night }),
    apiGet<ExerciseRow[]>("fitness", "exercise", range),
    apiGet<HealthRow[]>("fitness", "health", range),
  ]);
  return {
    sleep: (sleep ?? []).filter((r) => r.sleep_date === night),
    exercise: (exercise ?? []).filter((r) => r.event_date === date),
    health: (health ?? []).filter((r) => r.measured_at === date),
  };
}

function buildSnapshot(date: string, day: Awaited<ReturnType<typeof loadDay>>) {
  const night = preferredSleepRow(day.sleep.filter((r) => (r.duration_hours ?? 0) > 0));
  const sleepRows = night ? [night] : [];
  const sleepHours = night ? (night.duration_hours ?? 0) : null;

  const restDayRow = day.health.find((r) => r.metric_type === REST_DAY_METRIC_TYPE && r.value > 0) ?? null;
  const hasWorkoutEntries = day.exercise.length > 0;
  const workoutMinutes = hasWorkoutEntries ? day.exercise.reduce((sum, r) => sum + (r.duration_minutes ?? 0), 0) : null;

  // A logged workout wins over a rest-day mark for the same date.
  let workout: EnergyWorkoutInput | null = null;
  if (hasWorkoutEntries) {
    workout = { minutes: workoutMinutes ?? 0, intense: day.exercise.some((r) => r.intensity === "high") };
  } else if (restDayRow) {
    workout = { restDay: true };
  }

  const result = calculateEnergy({ sleep: sleepHours == null ? null : { hours: sleepHours }, workout });
  const snapshot: EnergySnapshot = {
    date,
    result,
    sleepHours,
    workoutMinutes,
    restDay: !!restDayRow,
    restDaySk: restDayRow?.sk ?? null,
    hasWorkoutEntries,
  };
  const meta: EnergyMeta = {
    basis: result.basis,
    sleep_score: result.sleepScore,
    workout_score: result.workoutScore,
    sleep_hours: sleepHours,
    workout_minutes: workoutMinutes,
    rest_day: !hasWorkoutEntries && !!restDayRow,
    sleep_sks: sleepRows.map((r) => r.sk),
    exercise_sks: day.exercise.map((r) => r.sk),
  };
  return { snapshot, meta };
}

async function writeEnergy(date: string, existing: HealthRow[], score: number | null, meta: EnergyMeta) {
  let changed = false;
  const [keep, ...extras] = existing;

  for (const row of score == null ? existing : extras) {
    await apiDelete("fitness", `health/${encodeURIComponent(row.sk)}`);
    changed = true;
  }
  if (score == null) return changed;

  const body = { measured_at: date, metric_type: ENERGY_METRIC_TYPE, value: score, unit: ENERGY_UNIT, meta };
  if (!keep) {
    await apiPost("fitness", "health", body);
    return true;
  }
  const same =
    keep.value === score && keep.unit === ENERGY_UNIT && JSON.stringify(keep.meta ?? null) === JSON.stringify(meta);
  if (!same) {
    await apiPut("fitness", `health/${encodeURIComponent(keep.sk)}`, body);
    changed = true;
  }
  return changed;
}

async function runSync(date: string): Promise<{ snapshot: EnergySnapshot; changed: boolean }> {
  const day = await loadDay(date);
  const { snapshot, meta } = buildSnapshot(date, day);
  const existing = day.health.filter((r) => r.metric_type === ENERGY_METRIC_TYPE);
  const changed = await writeEnergy(date, existing, snapshot.result.score, meta);
  return { snapshot, changed };
}

// Recalculates the date's energy from the night before's sleep + the date's
// workout entries and stores
// it as the date's single energy_level health metric (removed when neither
// input exists). Syncs for the same date run one after another so two quick
// saves can't both POST a new row.
const inflight = new Map<string, Promise<{ snapshot: EnergySnapshot; changed: boolean }>>();

export function syncEnergyForDate(date: string): Promise<{ snapshot: EnergySnapshot; changed: boolean }> {
  const previous = inflight.get(date) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => runSync(date));
  inflight.set(date, next);
  next.finally(() => {
    if (inflight.get(date) === next) inflight.delete(date);
  }).catch(() => {});
  return next;
}

// Fire-and-forget hook for the sleep/exercise API wrappers: a failed energy
// sync must never fail the save itself. The Personal page re-syncs on view,
// so a missed run heals the next time the date is looked at.
export function queueEnergySync(...dates: string[]): void {
  for (const date of new Set(dates)) {
    syncEnergyForDate(date).catch((error) => console.error(`[Energy] sync failed for ${date}:`, error));
  }
}

export async function setRestDay(date: string, restDay: boolean, restDaySk: string | null): Promise<void> {
  if (restDay && !restDaySk) {
    await apiPost("fitness", "health", { measured_at: date, metric_type: REST_DAY_METRIC_TYPE, value: 1, unit: "flag" });
  } else if (!restDay && restDaySk) {
    await apiDelete("fitness", `health/${encodeURIComponent(restDaySk)}`);
  }
  await syncEnergyForDate(date);
}

import { createSleepEntry, listSleepEntries } from "../api/sleep";
import {
  createExerciseEntry,
  createWeightEntry,
  listActivityTypes,
  listExerciseEntries,
  listWeights,
  isWeightInRange,
  type ActivityType,
} from "../api/fitness";
import { getGrantedRecordTypes, readExerciseSessions, readSleepSessions, readWeights } from "../native/healthConnect";
import { checkStepsAllowed } from "../steps/access";
import { syncSteps } from "../steps/sync";
import { labelForExerciseType } from "./exerciseLabels";
import { getSyncEnabled } from "./preference";
import { isBackgroundSyncAllowed } from "../syncGate";

const SYNC_LOOKBACK_DAYS = 7;
const HC_NOTE_MARKER = "Synced from Health Connect";

// The backend refuses a night over 24h and a day of exercise over 1440 min.
// Several apps writing the same session to Health Connect can make our
// per-day sum exceed that, so cap it rather than send something refused.
const MAX_SLEEP_HOURS = 24;
const MAX_EXERCISE_MINUTES = 1440;

// One date failing to save (a 400, a network blip) must not stop the other
// dates — each date is its own try. The failed one is retried on the next
// sync, since it still isn't "already logged".
async function eachDate<T>(items: Iterable<[string, T]>, save: (date: string, item: T) => Promise<unknown>): Promise<void> {
  for (const [date, item] of items) {
    try {
      await save(date, item);
    } catch (err) {
      console.warn(`Health Connect sync: couldn't save ${date}`, err);
    }
  }
}

// Local calendar date, not UTC — same reasoning as the screen-time sync's
// todayISO: converting an ISO instant with toISOString() alone rolls back to
// the previous day for any hour before the timezone offset catches up to
// midnight UTC, which would tag a sleep/weight entry with the wrong date.
function localDateOf(isoInstant: string): string {
  const d = new Date(isoInstant);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

// A night's sleep_date is the evening it started — the composers' "Last
// night" is yesterday, and the dashboard timeline reads sleep_date = today-1.
// A session starting in the early hours (00:00–05:59 local) belongs to the
// previous date's night.
const NIGHT_ROLLOVER_HOUR = 6;

function nightDateOf(isoInstant: string): string {
  const d = new Date(isoInstant);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  if (local.getUTCHours() < NIGHT_ROLLOVER_HOUR) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// "Date already has an entry -> skip" — deliberately date-based, not
// source-based: we never overwrite a manual entry, and once ANY entry
// (manual or previously HC-synced) exists for a date we leave it alone
// rather than trying to detect and refresh our own past auto-created rows.
let inFlightSync: Promise<void> | null = null;

// Gated (lib/syncGate.ts): no-op until this session's account has passed
// ProfileGate's age/profile check.
export function syncHealthConnect(): Promise<void> {
  if (!isBackgroundSyncAllowed()) return Promise.resolve();
  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    const from = isoDaysAgo(SYNC_LOOKBACK_DAYS);
    const to = new Date().toISOString();

    // Only the types the user granted; one type failing (a revoked
    // permission, a read error) never stops the others.
    const granted = await getGrantedRecordTypes();
    const jobs: [string, () => Promise<void>][] = [];
    if (granted.has("SleepSession")) jobs.push(["sleep", () => syncSleep(from, to)]);
    if (granted.has("Weight")) jobs.push(["weight", () => syncWeight(from, to)]);
    if (granted.has("ExerciseSession")) jobs.push(["exercise", () => syncExercise(from, to)]);
    // Steps upsert their own window of daily totals (lib/steps/sync.ts) —
    // unlike the rows above, a day's total changes, so it's re-sent. Only
    // for accounts that may use steps (checked live, fails closed): a Steps
    // grant left over from before (e.g. a 13–17 account while the flag is
    // off) is never read.
    if (granted.has("Steps") && (await checkStepsAllowed())) jobs.push(["steps", () => syncSteps()]);
    const results = await Promise.allSettled(jobs.map(([, run]) => run()));
    results.forEach((r, i) => {
      if (r.status === "rejected") console.warn(`Health Connect sync: ${jobs[i][0]} failed`, r.reason);
    });
  })();

  return inFlightSync.finally(() => {
    inFlightSync = null;
  });
}

// Foreground backstop, same shape as screen-time's App.tsx hook — safe to
// call unconditionally on every app-foreground transition since it no-ops
// unless the user has both opted in and granted the system permission.
export async function syncHealthConnectIfEnabled(): Promise<void> {
  if (!(await getSyncEnabled())) return;
  if ((await getGrantedRecordTypes()).size === 0) return;
  await syncHealthConnect();
}

async function syncSleep(from: string, to: string): Promise<void> {
  const sessions = await readSleepSessions(from, to);
  if (sessions.length === 0) return;

  const hoursByDate = new Map<string, number>();
  for (const s of sessions) {
    const date = nightDateOf(s.startTime);
    hoursByDate.set(date, (hoursByDate.get(date) ?? 0) + s.durationHours);
  }

  // nightDateOf(from) can be the day before localDateOf(from).
  const existing = await listSleepEntries({ from: nightDateOf(from), to: localDateOf(to) });
  const alreadyLogged = new Set(existing.map((e) => e.sleep_date));

  await eachDate([...hoursByDate].filter(([date]) => !alreadyLogged.has(date)), (date, hours) =>
    createSleepEntry({
      sleep_date: date,
      duration_hours: Math.min(MAX_SLEEP_HOURS, Math.round(hours * 10) / 10),
      notes: HC_NOTE_MARKER,
    }),
  );
}

async function syncWeight(from: string, to: string): Promise<void> {
  const samples = await readWeights(from, to);
  if (samples.length === 0) return;

  // Multiple weigh-ins the same day: keep the latest one.
  const latestByDate = new Map<string, { time: string; weightKg: number }>();
  for (const s of samples) {
    // Same 20–400 kg range as the web form and the Personal screen — an
    // out-of-range reading (wrong unit, a scale glitch) is skipped, not saved.
    if (!isWeightInRange(s.weightKg)) continue;
    const date = localDateOf(s.time);
    const current = latestByDate.get(date);
    if (!current || s.time > current.time) latestByDate.set(date, s);
  }

  const existing = await listWeights({ from: localDateOf(from), to: localDateOf(to) });
  const alreadyLogged = new Set(existing.map((e) => e.recorded_date));

  await eachDate([...latestByDate].filter(([date]) => !alreadyLogged.has(date)), (date, sample) =>
    createWeightEntry(date, Math.round(sample.weightKg * 10) / 10),
  );
}

// One entry per date (summed duration), same as sleep/weight — if a day had
// exercise sessions of more than one type, the specific type is ambiguous so
// it falls back to a generic label rather than picking one arbitrarily.
async function syncExercise(from: string, to: string): Promise<void> {
  const sessions = await readExerciseSessions(from, to);
  if (sessions.length === 0) return;

  const byDate = new Map<string, { minutes: number; types: Set<number> }>();
  for (const s of sessions) {
    const date = localDateOf(s.startTime);
    const bucket = byDate.get(date) ?? { minutes: 0, types: new Set<number>() };
    bucket.minutes += s.durationMinutes;
    bucket.types.add(s.exerciseType);
    byDate.set(date, bucket);
  }

  const existing = await listExerciseEntries({ from: localDateOf(from), to: localDateOf(to) });
  const alreadyLogged = new Set(existing.map((e) => e.event_date));

  let activityTypes: ActivityType[] | null = null;
  async function resolveActivityTypeId(label: string): Promise<string | null> {
    if (!activityTypes) activityTypes = await listActivityTypes();
    return activityTypes.find((a) => a.name_i18n.en.toLowerCase() === label.toLowerCase())?.id ?? null;
  }

  await eachDate([...byDate].filter(([date]) => !alreadyLogged.has(date)), async (date, bucket) => {
    const [firstType] = bucket.types;
    const label = bucket.types.size === 1 ? labelForExerciseType(firstType) : "Health Connect";
    const activityTypeId = await resolveActivityTypeId(label);
    await createExerciseEntry({
      event_date: date,
      activity_type_id: activityTypeId,
      custom_activity_name: activityTypeId ? null : label,
      duration_minutes: Math.min(MAX_EXERCISE_MINUTES, Math.round(bucket.minutes)),
      notes: HC_NOTE_MARKER,
    });
  });
}

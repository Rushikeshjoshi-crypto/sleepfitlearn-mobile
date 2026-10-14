// Exercise "Combine" rules. Mirrors the fitness Lambda (backend
// shared/dailyRows.js: exerciseActivityKey, exerciseParts,
// mergeExerciseActivity, exerciseCombineTarget, isCombinedExercise) so the app
// offers Combine exactly when the backend will combine, and shows / groups a
// combined row the way the backend built it. Byte-identical in the web and
// mobile apps (src/lib/exercise/combine.ts in both) — edit both together.
//
// A combined row keeps `activities: [{ activity_type_id,
// custom_activity_name, minutes }]` and duration_minutes is their total; its
// own activity_type_id stays the first activity's.

export const HC_NOTE_MARKER = "Synced from Health Connect";

export type ActivityRef = { activity_type_id?: string | null; custom_activity_name?: string | null };

export type ExerciseActivityPart = {
  activity_type_id: string | null;
  custom_activity_name: string | null;
  minutes: number;
};

type ExerciseRow = ActivityRef & {
  sk: string;
  event_date: string;
  duration_minutes: number | null;
  notes: string | null;
  created_at?: string;
  activities?: ExerciseActivityPart[] | null;
};

// activity_type_id when set, otherwise the free-text name (Health Connect /
// legacy rows), case- and space-insensitive. null = no activity.
export function exerciseActivityKey(row: ActivityRef): string | null {
  if (row.activity_type_id) return `id:${row.activity_type_id}`;
  const name = typeof row.custom_activity_name === "string" ? row.custom_activity_name.trim().toLowerCase() : "";
  return name ? `name:${name}` : null;
}

// A row's per-activity minutes: its `activities` list, or — for a row that
// was never combined — one part made from its own activity and duration.
export function exerciseParts(row: Omit<ExerciseRow, "sk" | "event_date" | "notes">): ExerciseActivityPart[] {
  if (Array.isArray(row.activities) && row.activities.length > 0) return row.activities;
  return [
    {
      activity_type_id: row.activity_type_id ?? null,
      custom_activity_name: row.custom_activity_name ?? null,
      minutes: typeof row.duration_minutes === "number" ? row.duration_minutes : 0,
    },
  ];
}

// Adds `part`: the same activity's minutes grow, a new one is appended.
export function mergeExerciseActivity(parts: ExerciseActivityPart[], part: ExerciseActivityPart): ExerciseActivityPart[] {
  const key = exerciseActivityKey(part);
  const i = parts.findIndex((p) => exerciseActivityKey(p) === key);
  if (i < 0) return [...parts, part];
  return parts.map((p, j) => (j === i ? { ...p, minutes: p.minutes + part.minutes } : p));
}

// 2+ activities: minutes/activity are locked on edit (only notes and
// intensity change) — one new total can't say which activity's minutes
// changed. The backend refuses such edits with 409 combined_entry_locked.
export function isCombinedExercise(row: { activities?: ExerciseActivityPart[] | null }): boolean {
  return Array.isArray(row.activities) && row.activities.length >= 2;
}

function isNewer(a: ExerciseRow, b: ExerciseRow | null): boolean {
  if (!b) return true;
  const ca = a.created_at ?? "";
  const cb = b.created_at ?? "";
  if (ca !== cb) return ca > cb;
  return a.sk > b.sk;
}

// The row a combine adds to: the newest row on that date with a numeric
// duration, whatever its activity — never a Health Connect row.
export function findCombineTarget<T extends ExerciseRow>(rows: T[], eventDate: string): T | null {
  let target: T | null = null;
  for (const r of rows) {
    if (r.event_date !== eventDate || r.notes === HC_NOTE_MARKER) continue;
    if (typeof r.duration_minutes !== "number") continue;
    if (isNewer(r, target)) target = r;
  }
  return target;
}

// Minutes a row contributes to one activity (0 if it has none of it) — for
// per-activity grouping, filters and stats.
export function minutesForActivity(row: Omit<ExerciseRow, "sk" | "event_date" | "notes">, key: string | null): number {
  return exerciseParts(row)
    .filter((p) => exerciseActivityKey(p) === key)
    .reduce((sum, p) => sum + p.minutes, 0);
}

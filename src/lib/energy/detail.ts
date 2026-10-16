import type { EnergySnapshot } from "./sync";

// The Energy popup's text parts (Personal.energy keys) — same rules as the
// web's EnergyLevelCard Breakdown: sleep hours to 1 decimal with its score,
// workout minutes (or "rest day") with its score, "not logged" otherwise,
// and a "based on sleep / workout only" note when just one was logged.
type Part = { key: string; values: Record<string, string | number> };

export function energyBreakdown(snapshot: EnergySnapshot): { sleep: Part; workout: Part; basis: string | null } {
  const { result, sleepHours, workoutMinutes, hasWorkoutEntries, restDay } = snapshot;

  const sleep: Part =
    result.sleepScore != null && sleepHours != null
      ? { key: "sleepPart", values: { hours: String(Math.round(sleepHours * 10) / 10), score: result.sleepScore } }
      : { key: "sleepMissing", values: {} };

  let workout: Part = { key: "workoutMissing", values: {} };
  if (result.workoutScore != null) {
    workout =
      !hasWorkoutEntries && restDay
        ? { key: "workoutRest", values: { score: result.workoutScore } }
        : { key: "workoutPart", values: { minutes: workoutMinutes ?? 0, score: result.workoutScore } };
  }

  const basis = result.basis === "sleep" ? "basedOnSleep" : result.basis === "workout" ? "basedOnWorkout" : null;
  return { sleep, workout, basis };
}

// "YYYY-MM-DD" moved by whole calendar days (noon, so DST never skips a day).
export function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Byte-identical in the mobile app and the web app (src/lib/vitals/display.ts).
import type { PersonalEntry } from "../api/fitness";

type HeartRateEntry = Exclude<PersonalEntry, { kind: "bp" }> & { kind: "heart_rate" };
type BpEntry = Extract<PersonalEntry, { kind: "bp" }>;

// The newest day Health Connect summarised (min / avg / max / resting).
// Manual heart rate entries are spot readings, not a day's summary.
export function latestHeartRateDay(entries: PersonalEntry[]): HeartRateEntry | null {
  const days = entries.filter((e): e is HeartRateEntry => e.kind === "heart_rate" && !!e.vitals);
  return days.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

// Newest BP readings first, Health Connect and manual alike.
export function recentBloodPressure(entries: PersonalEntry[], limit: number): BpEntry[] {
  return entries
    .filter((e): e is BpEntry => e.kind === "bp")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export function hasSyncedVitals(entries: PersonalEntry[]): boolean {
  return entries.some((e) => (e.kind === "heart_rate" || e.kind === "bp") && !!e.vitals);
}

// Synced HR/BP rows taken out (manual entries stay) — for an account that may
// not see them: 13–17 while minor_data_enabled is off, under-13, or when the
// age status couldn't be read (lib/vitals/eligibility.ts, fail closed).
export function hideSyncedVitals(entries: PersonalEntry[]): PersonalEntry[] {
  return entries.filter((e) => !((e.kind === "heart_rate" || e.kind === "bp") && e.vitals));
}

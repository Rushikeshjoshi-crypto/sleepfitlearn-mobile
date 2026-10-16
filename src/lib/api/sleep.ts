import { apiGet, apiPost, apiPut, apiDelete } from "./client";
import { dateFromSk, energyDateForSleep, queueEnergySync } from "../energy/sync";

export type SleepEntry = {
  id: string;
  sk: string;
  sleep_date: string;
  bedtime: string | null;
  wake_time: string | null;
  duration_hours: number | null;
  notes: string | null;
};

export type SleepEntryInput = {
  sleep_date: string;
  bedtime?: string | null;
  wake_time?: string | null;
  duration_hours?: number | null;
  notes?: string | null;
};

export type SleepEntryUpdate = {
  bedtime?: string | null;
  wake_time?: string | null;
  duration_hours?: number | null;
  notes?: string | null;
};

export function listSleepEntries(range?: { from: string; to: string }): Promise<SleepEntry[]> {
  return apiGet<SleepEntry[]>("sleep", "", range);
}

// Every sleep write also recalculates the NEXT day's energy level — a night
// counts for the day after it (lib/energy energyDateForSleep).
export async function createSleepEntry(input: SleepEntryInput): Promise<SleepEntry> {
  const entry = await apiPost<SleepEntry>("sleep", "", input);
  queueEnergySync(energyDateForSleep(input.sleep_date));
  return entry;
}

// `sk` contains a "#" and must be encoded before it reaches the URL.
export async function updateSleepEntry(sk: string, input: SleepEntryUpdate): Promise<SleepEntry> {
  const entry = await apiPut<SleepEntry>("sleep", encodeURIComponent(sk), input);
  queueEnergySync(energyDateForSleep(dateFromSk(sk)));
  return entry;
}

export async function deleteSleepEntry(sk: string): Promise<void> {
  await apiDelete("sleep", encodeURIComponent(sk));
  queueEnergySync(energyDateForSleep(dateFromSk(sk)));
}

// Client-side only — the backend accepts any duration_hours value silently
// (matches the web app's SleepLogPanel.tsx exactly). Handles a bedtime after
// midnight-crossing wake time (e.g. 23:00 -> 07:00 = 8h).
export function computeDurationHours(bedtime: string, wakeTime: string): number | null {
  const bedMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(bedtime);
  const wakeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(wakeTime);
  if (!bedMatch || !wakeMatch) return null;

  const bedMinutes = parseInt(bedMatch[1], 10) * 60 + parseInt(bedMatch[2], 10);
  const wakeMinutes = parseInt(wakeMatch[1], 10) * 60 + parseInt(wakeMatch[2], 10);
  const diff = wakeMinutes <= bedMinutes ? wakeMinutes + 24 * 60 - bedMinutes : wakeMinutes - bedMinutes;
  return Math.round((diff / 60) * 10) / 10;
}

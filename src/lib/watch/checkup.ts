import { watchAppSharesKnown } from "./knownApps";

// "Connect your watch" checkup: what's missing between the user's watch and
// this app, in order, each step with at most one action for the UI.
//   1. Health Connect on the phone        → installHealthConnect
//   2. our read permission (all types)    → allow
//   3. a watch app on the phone           → (info only)
//   4. that app writes into Health Connect→ openWatchApp (turn its sharing on)
// Heart rate / BP only count when the account may use them (vitalsAllowed:
// lib/vitals/eligibility.ts); otherwise only sleep data is looked at.

export const BASE_TYPES = ["SleepSession", "ExerciseSession", "Weight"] as const;
export const VITAL_TYPES = ["HeartRate", "RestingHeartRate", "BloodPressure"] as const;

export type CheckupInput = {
  hcAvailable: boolean;
  granted: Set<string>;
  vitalsAllowed: boolean;
  // Known watch apps installed on the phone (lib/watch/knownApps.ts).
  installed: string[];
  // Apps that wrote each type into Health Connect in the last 30 days.
  writers: { HeartRate: string[]; BloodPressure: string[]; SleepSession: string[] };
};

export type CheckupStep =
  | { id: "healthConnect"; status: "ok" | "todo"; action: "installHealthConnect" | null }
  | { id: "permission"; status: "ok" | "todo"; action: "allow" | null }
  | { id: "watchApp"; status: "ok" | "todo"; action: null; apps: string[] }
  | { id: "data"; status: "ok" | "todo"; action: "openWatchApp" | null; app?: string; writers: string[]; mayNotShare?: true };

export type Checkup = { ready: boolean; steps: CheckupStep[] };

export function neededTypes(vitalsAllowed: boolean): string[] {
  return [...BASE_TYPES, ...(vitalsAllowed ? VITAL_TYPES : [])];
}

export function buildCheckup(input: CheckupInput): Checkup {
  if (!input.hcAvailable) {
    return { ready: false, steps: [{ id: "healthConnect", status: "todo", action: "installHealthConnect" }] };
  }
  const steps: CheckupStep[] = [{ id: "healthConnect", status: "ok", action: null }];

  const allGranted = neededTypes(input.vitalsAllowed).every((t) => input.granted.has(t));
  steps.push({ id: "permission", status: allGranted ? "ok" : "todo", action: allGranted ? null : "allow" });

  const writers = [
    ...new Set([
      ...input.writers.SleepSession,
      ...(input.vitalsAllowed ? [...input.writers.HeartRate, ...input.writers.BloodPressure] : []),
    ]),
  ].filter(Boolean).sort();

  const apps = [...new Set([...input.installed, ...writers])].sort();
  steps.push({ id: "watchApp", status: apps.length ? "ok" : "todo", action: null, apps });

  if (writers.length) {
    steps.push({ id: "data", status: "ok", action: null, writers });
  } else {
    // Prefer an installed app that's known to share; else the first one.
    const app = input.installed.find(watchAppSharesKnown) ?? input.installed[0];
    steps.push(
      app
        ? { id: "data", status: "todo", action: "openWatchApp", app, writers: [], ...(!watchAppSharesKnown(app) && { mayNotShare: true as const }) }
        : { id: "data", status: "todo", action: null, writers: [] },
    );
  }

  return { ready: steps.every((s) => s.status === "ok"), steps };
}

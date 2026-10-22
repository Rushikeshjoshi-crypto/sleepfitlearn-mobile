import { MANUAL_SOURCE, sourceLabel } from "../vitals/sourceLabel";

// Pure helpers for the steps views (Home card, Trends) — same rules as the
// web app's src/lib/steps/display.ts.

export const DEFAULT_STEP_GOAL = 10000;

// The goal from the users profile (1000–50000), or 10,000 when none is set.
export function stepGoal(profile: { daily_step_goal?: number | null } | null | undefined): number {
  const goal = profile?.daily_step_goal;
  return typeof goal === "number" && goal > 0 ? goal : DEFAULT_STEP_GOAL;
}

// % of the goal reached, 0–100 (the bar stops at full).
export function stepProgress(steps: number | null | undefined, goal: number): number {
  if (typeof steps !== "number" || goal <= 0) return 0;
  return Math.min(100, Math.round((steps / goal) * 100));
}

// A day without a row is missing ("No data"), not 0. A stored 0 is data.
export function isMissingDay(day: { steps?: number | null } | null | undefined): boolean {
  return typeof day?.steps !== "number";
}

// True when no day in the week has a row — show the empty state instead.
export function noStepsSynced(daily: ({ steps?: number | null } | null)[] | null | undefined): boolean {
  return (daily ?? []).every(isMissingDay);
}

// "Health Connect · Samsung Health" for synced rows, "Manual" for manual ones.
// `t` is the Vitals namespace (fromHealthConnect / manual), shared with HR/BP.
export function stepsSourceText(
  row: { source?: string | null; meta?: { source?: string; origins?: string[] } | null },
  t: (key: "fromHealthConnect" | "manual", values?: { app: string }) => string,
  healthConnect: string,
): string {
  const source = row.source ?? row.meta?.source;
  if (source === MANUAL_SOURCE) return t("manual");
  const origins = stepsOrigins(row);
  return origins.length ? t("fromHealthConnect", { app: origins.map(sourceLabel).join(", ") }) : healthConnect;
}

// The apps Health Connect says wrote a day's steps (package names).
export function stepsOrigins(row: { meta?: { origins?: string[] } | null } | null | undefined): string[] {
  return (row?.meta?.origins ?? []).filter((o) => typeof o === "string" && o);
}

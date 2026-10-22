import type { UserProfile } from "../api/users";
import { isMissingDay } from "./display";

// Daily step goal, set from the Home Steps card — same rules and numbers as
// the web app's src/lib/steps/goal.ts. Same bounds as the users API
// (sleepfitlearn-users: integer 1000–50000).
export const MIN_STEP_GOAL = 1000;
export const MAX_STEP_GOAL = 50000;
export const STEP_GOAL_PRESETS = [5000, 8000, 10000, 12000] as const;

// The popup's input is a string; whole numbers in range only (the web uses
// zod for the same check — no extra dependency here).
export function parseStepGoal(input: string): number | null {
  const v = input.trim();
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= MIN_STEP_GOAL && n <= MAX_STEP_GOAL ? n : null;
}

// 7200 → "7.2K" (locale-aware short form for the bar labels). Some Hermes
// builds don't support notation: "compact" — fall back to the same short form.
export function compactSteps(n: number, locale = "en"): string {
  const compact = compactFormatter(locale);
  if (compact) return compact.format(n);
  if (n < 1000) return String(n);
  const k = Math.round((n / 1000) * 10) / 10;
  return `${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K`;
}

// null when this engine ignores notation: "compact" (1000 comes out as "1,000").
function compactFormatter(locale: string): Intl.NumberFormat | null {
  try {
    const f = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 } as Intl.NumberFormatOptions);
    return f.format(1000) !== new Intl.NumberFormat(locale).format(1000) ? f : null;
  } catch {
    return null;
  }
}

export type StepBar = {
  date: string;
  dayLabel: string;
  steps: number | null; // null = no row synced ("No data")
  missing: boolean;
  heightPct: number; // of the chart area; 0 for missing / 0 steps
  reached: boolean; // steps >= goal → accent colour
  isToday: boolean;
};

// The Home chart: bars are scaled to max(goal, highest day) so the goal line
// always sits inside the chart.
export function stepChart(
  daily: ({ date?: string; day_label?: string; steps?: number | null } | null)[],
  goal: number,
  today: string,
): { scale: number; goalPct: number; bars: StepBar[] } {
  const highest = Math.max(0, ...daily.map((d) => (isMissingDay(d) ? 0 : (d!.steps as number))));
  const scale = Math.max(goal, highest, 1);
  const bars = daily.map((d, i): StepBar => {
    const missing = isMissingDay(d);
    const steps = missing ? null : (d!.steps as number);
    return {
      date: d?.date ?? String(i),
      dayLabel: d?.day_label ?? "",
      steps,
      missing,
      // A small stub for a day with some steps, so it doesn't vanish.
      heightPct: steps ? Math.max(3, Math.round((steps / scale) * 100)) : 0,
      reached: steps != null && steps >= goal,
      isToday: d?.date === today,
    };
  });
  return { scale, goalPct: Math.round((goal / scale) * 100), bars };
}

// Optimistic goal save: show the new goal at once, then the server's profile;
// on error put the previous profile back and rethrow (caller shows the alert).
// `update` is updateUserProfile, which merges the full stored profile so only
// daily_step_goal changes.
export async function saveStepGoalOptimistic(
  profile: UserProfile,
  goal: number,
  setProfile: (p: UserProfile) => void,
  update: (partial: { daily_step_goal: number }) => Promise<UserProfile>,
): Promise<UserProfile> {
  setProfile({ ...profile, daily_step_goal: goal });
  try {
    // Spread over the old profile so read-only fields the PUT response may
    // not carry (age_band, restricted_fields, …) aren't dropped.
    const saved = await update({ daily_step_goal: goal });
    // An older users Lambda (before daily_step_goal) answers 200 but drops
    // the field — treat that as a failed save, not a silent reset to 10,000.
    if (saved?.daily_step_goal !== goal) throw new Error("step_goal_not_saved");
    const updated = { ...profile, ...saved };
    setProfile(updated);
    return updated;
  } catch (err) {
    setProfile(profile);
    throw err;
  }
}

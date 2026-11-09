import type { WeeklySnapshot } from "../api/dashboard";
import { noStepsSynced } from "../steps/display";
import { lockedStepGoal } from "../settings/lockedStepGoal";

// Pure helpers behind the Home profile, "This week" and "Getting started"
// cards (same rules as the web's src/lib/dashboard/home.ts). Everything comes
// from data the screen already loads; a value the data can't support is null
// and the UI shows "No data", never 0.

type Day = { date?: string; day_label?: string; hours?: number; minutes?: number; steps?: number | null; worked_out?: boolean };
type Daily = (Day | null | undefined)[];

const daily = (d: Daily | undefined | null): Daily => d ?? [];
const sleptOn = (d: Day | null | undefined) => typeof d?.hours === "number" && d.hours > 0;
const studiedOn = (d: Day | null | undefined) => typeof d?.minutes === "number" && d.minutes > 0;

// Bar heights in % (min 4 so an empty day still shows a stub).
export function barHeights(days: Daily, key: "hours" | "minutes" | "steps", max?: number): number[] {
  const values = days.map((d) => (typeof d?.[key] === "number" ? (d[key] as number) : 0));
  const cap = max ?? Math.max(...values, 1);
  return values.map((v) => Math.max(4, Math.round((v / cap) * 100)));
}

export function daysLoggedThisWeek(snapshot: WeeklySnapshot): number | null {
  const sleep = daily(snapshot.sleep?.daily);
  const fitness = daily(snapshot.fitness?.daily);
  const study = daily(snapshot.study?.daily);
  const n = Math.max(sleep.length, fitness.length, study.length);
  if (n === 0) return null;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (sleptOn(sleep[i]) || fitness[i]?.worked_out || studiedOn(study[i])) count++;
  }
  return count;
}

export function avgSleepHours(snapshot: WeeklySnapshot): number | null {
  if (!daily(snapshot.sleep?.daily).some(sleptOn)) return null;
  const avg = snapshot.sleep?.avg_hours;
  return typeof avg === "number" ? avg : null;
}

export function studyHoursThisWeek(snapshot: WeeklySnapshot): number | null {
  if (!daily(snapshot.study?.daily).some(studiedOn)) return null;
  const total = snapshot.study?.total_hours;
  return typeof total === "number" ? total : null;
}

export function stepsToday(snapshot: WeeklySnapshot): number | null {
  const today = snapshot.steps?.today;
  return typeof today === "number" ? today : null;
}

export type ProfileStat = { key: "daysLogged" | "avgSleep" | "stepsToday" | "studyThisWeek"; value: number | null };

export function profileStats(snapshot: WeeklySnapshot, stepsAllowed: boolean): ProfileStat[] {
  return [
    { key: "daysLogged", value: daysLoggedThisWeek(snapshot) },
    { key: "avgSleep", value: avgSleepHours(snapshot) },
    stepsAllowed
      ? { key: "stepsToday", value: stepsToday(snapshot) }
      : { key: "studyThisWeek", value: studyHoursThisWeek(snapshot) },
  ];
}

export type WeekTab = "sleep" | "fitness" | "study" | "steps";

export function weekTabs(stepsAllowed: boolean): WeekTab[] {
  return stepsAllowed ? ["sleep", "fitness", "study", "steps"] : ["sleep", "fitness", "study"];
}

export type WeekBar = { date: string; dayLabel: string; heightPct: number; isToday: boolean; missing: boolean };

export function weekSeries(snapshot: WeeklySnapshot, tab: WeekTab): { value: number | null; bars: WeekBar[] } {
  const today = snapshot.range?.to;
  let days: Daily;
  let heights: number[];
  let value: number | null;
  let missing: (d: Day | null | undefined) => boolean;
  switch (tab) {
    case "sleep":
      days = daily(snapshot.sleep?.daily);
      heights = barHeights(days, "hours", 10);
      value = avgSleepHours(snapshot);
      missing = (d) => !sleptOn(d);
      break;
    case "fitness":
      days = daily(snapshot.fitness?.daily);
      heights = days.map((d) => (d?.worked_out ? 100 : 4));
      value = days.length ? snapshot.fitness?.workout_days ?? 0 : null;
      missing = (d) => !d?.worked_out;
      break;
    case "study":
      days = daily(snapshot.study?.daily);
      heights = barHeights(days, "minutes");
      value = studyHoursThisWeek(snapshot);
      missing = (d) => !studiedOn(d);
      break;
    case "steps":
      days = daily(snapshot.steps?.daily);
      heights = barHeights(days, "steps");
      value = stepsToday(snapshot);
      missing = (d) => typeof d?.steps !== "number";
      break;
  }
  return {
    value,
    bars: days.map((d, i) => ({
      date: d?.date ?? String(i),
      dayLabel: d?.day_label ?? "",
      heightPct: heights[i] ?? 4,
      isToday: Boolean(today) && d?.date === today,
      missing: missing(d),
    })),
  };
}

export type StartItemKey = "sleep" | "stepGoal" | "healthConnect" | "study";
export type StartItem = { key: StartItemKey; done: boolean };

type StartInput = {
  snapshot: WeeklySnapshot;
  timeline: { sleep: unknown; study: unknown } | null;
  profile: { daily_step_goal?: number | null; restricted_fields?: string[] | null } | null;
  stepsAllowed: boolean;
};

export function gettingStartedItems({ snapshot, timeline, profile, stepsAllowed }: StartInput): StartItem[] {
  const items: StartItem[] = [
    { key: "sleep", done: daily(snapshot.sleep?.daily).some(sleptOn) || Boolean(timeline?.sleep) },
  ];
  if (stepsAllowed && !lockedStepGoal(profile)) {
    items.push({ key: "stepGoal", done: typeof profile?.daily_step_goal === "number" });
  }
  if (stepsAllowed) {
    items.push({ key: "healthConnect", done: stepsToday(snapshot) !== null || !noStepsSynced(snapshot.steps?.daily) });
  }
  items.push({
    key: "study",
    done: Boolean(snapshot.study?.last_logged_at) || daily(snapshot.study?.daily).some(studiedOn) || Boolean(timeline?.study),
  });
  return items;
}

export function showGettingStarted(items: StartItem[]): boolean {
  return items.some((i) => !i.done);
}

export function avatarInitial(nickname: string | null | undefined): string | null {
  const first = Array.from((nickname ?? "").trim())[0];
  return first ? first.toLocaleUpperCase() : null;
}

// "Jan 6 – Jan 12" from the snapshot's YYYY-MM-DD range; null when it isn't one.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatWeekRange(from?: string | null, to?: string | null): string | null {
  if (!from || !to || !ISO_DAY.test(from) || !ISO_DAY.test(to) || from > to) return null;
  const f = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}`;
  return `${f(from)} – ${f(to)}`;
}

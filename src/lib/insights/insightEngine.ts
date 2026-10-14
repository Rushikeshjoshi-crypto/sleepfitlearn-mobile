// Rule-based Energy & Mood Correlation cards for the Home page / screen.
// Pure functions only — no fetching, no side effects. The backend
// (/dashboard/weekly-snapshot) supplies raw per-day series; everything here
// just reads that data and picks a message. Adding or tweaking a rule never
// needs a deploy on the API side.
//
// Byte-identical in the web and mobile apps (src/lib/insights/insightEngine.ts
// in both) — edit both together. A card carries a message KEY and its params,
// never text: the title/body live in the "InsightCards" i18n namespace
// (InsightCards.<messageKey>.title / .body) in all 7 languages.
//
// The schema only tracks a single "energy_level" metric — there's no
// separate "mood" field — so it doubles as both signals below. It's the
// 0-100 score calculated from sleep + workout (src/lib/energy).

// Every message, with the placeholders its body uses.
export const INSIGHT_MESSAGES = {
  sleep_low: [],
  recovery: [],
  study_gap: ["hours"],
  high_energy: [],
  energy_tip: [],
  not_enough_days: [],
  need_both_days: [],
  need_more_days: [],
  balanced_mood: ["avg"],
  workout_energy_boost: ["percent"],
  mood_swings: ["percent"],
} as const satisfies Record<string, readonly string[]>;

export type InsightMessageKey = keyof typeof INSIGHT_MESSAGES;

export type InsightCard = {
  // Card kind (icon/colour); several messages can share one (not_enough_data).
  key: string;
  messageKey: InsightMessageKey;
  params: Record<string, number>;
};

export type DailyLogData = {
  date: string;
  sleepHours: number;
  workedOut: boolean;
  intensity: "low" | "moderate" | "high" | null;
  studyMinutes: number;
  energy: number | null;
};

const card = (key: string, messageKey: InsightMessageKey, params: Record<string, number> = {}): InsightCard => ({
  key,
  messageKey,
  params,
});

// Minutes since the last study session was logged, or null if none exists
// in the fetched window at all (so the rule can be skipped rather than
// treating "never logged" the same as "logged an hour ago").
export function getStudyGapMinutes(lastStudyLoggedAt: string | null, now: Date = new Date()): number | null {
  if (!lastStudyLoggedAt) return null;
  const loggedAt = new Date(lastStudyLoggedAt).getTime();
  if (Number.isNaN(loggedAt)) return null;
  return Math.max(0, Math.round((now.getTime() - loggedAt) / 60000));
}

// Priority chain, top to bottom — first match wins, only one card shown.
export function getEnergyInsight(today: DailyLogData & { studyGapMinutes: number | null }): InsightCard {
  if (today.sleepHours > 0 && today.sleepHours < 7) return card("sleep_low", "sleep_low");
  if (today.workedOut && today.intensity === "high") return card("recovery", "recovery");
  if (today.studyGapMinutes != null && today.studyGapMinutes > 60) {
    return card("study_gap", "study_gap", { hours: Math.floor(today.studyGapMinutes / 60) });
  }
  if (today.energy != null && today.energy >= 80) return card("high_energy", "high_energy");
  return card("energy_tip", "energy_tip");
}

const MIN_LOGGED_DAYS_FOR_PATTERN = 3;

function hasAnyLog(day: DailyLogData): boolean {
  return day.sleepHours > 0 || day.workedOut || day.studyMinutes > 0 || day.energy != null;
}

// Second card: a simple correlation once there's enough data, otherwise the
// same "keep logging" nudge as before.
export function getPatternInsight(last7DaysLogs: DailyLogData[]): InsightCard {
  const loggedDays = last7DaysLogs.filter(hasAnyLog);
  if (loggedDays.length < MIN_LOGGED_DAYS_FOR_PATTERN) return card("not_enough_data", "not_enough_days");

  const workoutEnergy = last7DaysLogs.filter((d) => d.workedOut && d.energy != null).map((d) => d.energy as number);
  const restEnergy = last7DaysLogs.filter((d) => !d.workedOut && d.energy != null).map((d) => d.energy as number);
  if (workoutEnergy.length === 0 || restEnergy.length === 0) return card("not_enough_data", "need_both_days");

  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const workoutAvg = avg(workoutEnergy);
  const restAvg = avg(restEnergy);
  if (restAvg <= 0) return card("not_enough_data", "need_more_days");

  const percentDiff = Math.round(((workoutAvg - restAvg) / restAvg) * 100);
  if (Math.abs(percentDiff) < 5) return card("balanced_mood", "balanced_mood", { avg: Math.round(workoutAvg) });

  return percentDiff > 0
    ? card("workout_energy_boost", "workout_energy_boost", { percent: percentDiff })
    : card("mood_swings", "mood_swings", { percent: Math.abs(percentDiff) });
}

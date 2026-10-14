// Energy level is derived, never typed in: a 0-100 score from the day's sleep
// and workout. Everything about the formula lives in this file — change a
// weight or a band here and the Personal card, the stored health metric and
// the tooltip copy all follow.
//
// Byte-identical in the web and mobile apps (src/lib/energy/ in both) — edit
// both together; each repo's tests check the formula and the sync.
// Kept free of "@/" imports so the unit test can load it directly.

export const ENERGY_WEIGHTS = { sleep: 0.6, workout: 0.4 } as const;

export type EnergyWeights = { sleep: number; workout: number };

export type EnergyLabel = "high" | "good" | "moderate" | "low";

// Which inputs the score was built from.
export type EnergyBasis = "both" | "sleep" | "workout" | "none";

export type EnergySleepInput = {
  hours: number;
  // 1-5 when the user tracks sleep quality; averaged with the duration score.
  quality?: number | null;
};

export type EnergyWorkoutInput =
  | { restDay: true }
  | { restDay?: false; minutes: number; intense: boolean };

export type EnergyInput = {
  sleep: EnergySleepInput | null;
  workout: EnergyWorkoutInput | null;
};

export type EnergyResult = {
  basis: EnergyBasis;
  score: number | null;
  label: EnergyLabel | null;
  sleepScore: number | null;
  workoutScore: number | null;
};

export function sleepDurationScore(hours: number): number {
  if (hours >= 7 && hours <= 9) return 100;
  if ((hours >= 6 && hours < 7) || (hours > 9 && hours <= 10)) return 75;
  if (hours >= 5 && hours < 6) return 50;
  if (hours < 5) return 25;
  // Over 10 hours isn't in the spec's bands; treat oversleeping like a short night.
  return 50;
}

export function sleepScore({ hours, quality }: EnergySleepInput): number {
  const duration = sleepDurationScore(hours);
  if (quality == null || quality < 1 || quality > 5) return duration;
  return Math.round((duration + (quality / 5) * 100) / 2);
}

export function workoutScore(workout: EnergyWorkoutInput): number {
  if (workout.restDay) return 70;
  if (workout.minutes <= 0) return 40;
  if (workout.intense || workout.minutes > 60) return 75;
  if (workout.minutes < 20) return 60;
  return 100;
}

export function energyLabel(score: number): EnergyLabel {
  if (score >= 80) return "high";
  if (score >= 60) return "good";
  if (score >= 40) return "moderate";
  return "low";
}

// With only one input available, that input carries the whole score.
export function calculateEnergy(input: EnergyInput, weights: EnergyWeights = ENERGY_WEIGHTS): EnergyResult {
  const s = input.sleep ? sleepScore(input.sleep) : null;
  const w = input.workout ? workoutScore(input.workout) : null;

  let score: number | null = null;
  let basis: EnergyBasis = "none";
  if (s != null && w != null) {
    score = (s * weights.sleep + w * weights.workout) / (weights.sleep + weights.workout);
    basis = "both";
  } else if (s != null) {
    score = s;
    basis = "sleep";
  } else if (w != null) {
    score = w;
    basis = "workout";
  }

  const rounded = score == null ? null : Math.round(score);
  return {
    basis,
    score: rounded,
    label: rounded == null ? null : energyLabel(rounded),
    sleepScore: s,
    workoutScore: w,
  };
}

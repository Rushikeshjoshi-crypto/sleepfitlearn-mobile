// "Skip for now" on the birth-year prompt — EXISTING accounts only (profiles
// created before birth years were collected, dob_required). New sign-ups
// can't skip: the backend refuses to create a profile without one.
//
// A skip snoozes the prompt on this device for BIRTH_YEAR_REPROMPT_DAYS.
// Family features stay unavailable until a birth year is saved (the backend
// refuses invites/accepts with birth_year_required), and those screens point
// to Settings. Same rule as the web app's src/lib/family/birthYearPrompt.ts.

export const BIRTH_YEAR_REPROMPT_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isBirthYearPromptSnoozed(
  skippedAtMs: number | null,
  nowMs = Date.now(),
  days = BIRTH_YEAR_REPROMPT_DAYS,
): boolean {
  if (skippedAtMs == null || !Number.isFinite(skippedAtMs)) return false;
  const elapsed = nowMs - skippedAtMs;
  // A timestamp in the future (clock changed) doesn't count as a snooze.
  return elapsed >= 0 && elapsed < days * DAY_MS;
}

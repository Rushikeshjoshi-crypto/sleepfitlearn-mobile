import type { AgeBand } from "../api/users";

// Client-side mirror of sleepfitlearn-users/age.js (same as the web app's
// src/lib/family/age.ts), used only for instant sign-up feedback — the
// backend re-checks and is authoritative. Only a birth year is known, so
// this uses the youngest age the person could be.
export function ageBandFromBirthYear(year: number, now = new Date()): AgeBand {
  const youngestPossibleAge = now.getFullYear() - year - 1;
  if (youngestPossibleAge < 13) return "under_13";
  if (youngestPossibleAge < 18) return "13_17";
  return "18_plus";
}

export function parseBirthYearInput(raw: string, now = new Date()): number | null {
  const trimmed = raw.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;
  const year = Number(trimmed);
  return year >= 1900 && year <= now.getFullYear() ? year : null;
}

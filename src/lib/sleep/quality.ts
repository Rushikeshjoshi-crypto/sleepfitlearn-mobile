// Sleep quality: the existing zones (Sleep.durationZones), shared by the
// Sleep page and SleepDurationBar.

export type SleepZone = "invalid" | "tooLittle" | "aBitShort" | "greatRange" | "longNight";

export function sleepZone(hours: number): SleepZone {
  if (!(hours > 0)) return "invalid";
  if (hours < 5) return "tooLittle";
  if (hours < 7) return "aBitShort";
  if (hours <= 9) return "greatRange";
  return "longNight";
}

// Calendar tile colour for a zone: red for too little / invalid, medium
// orange for a bit short, orange for 7h and up (great range, long night).
export type SleepTone = "short" | "good" | "great";

export function sleepTone(zone: SleepZone): SleepTone {
  if (zone === "invalid" || zone === "tooLittle") return "short";
  if (zone === "aBitShort") return "good";
  return "great";
}

// "Short" (red) is the same as before: too little sleep or an invalid night.
export function isShortSleep(zone: SleepZone): boolean {
  return zone === "invalid" || zone === "tooLittle";
}

export const SLEEP_GOAL_HOURS = 8;

// Share of the 8h goal, 0–100 (quality bars stop at full).
export function goalPercent(hours: number | null | undefined): number {
  if (typeof hours !== "number" || !(hours > 0)) return 0;
  return Math.min(100, Math.round((hours / SLEEP_GOAL_HOURS) * 100));
}

// 7.5 → "7.5h", 8 → "8h" (same as the existing history and log form).
export function formatHours(hours: number | null | undefined): string {
  return typeof hours === "number" ? `${hours}h` : "—";
}

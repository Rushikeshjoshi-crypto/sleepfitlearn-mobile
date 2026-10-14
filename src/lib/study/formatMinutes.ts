// Ports src/components/study/formatMinutes.ts from the web app directly —
// framework-agnostic, no changes needed.
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Splits a total-minutes value (the shape stored/sent to the API) into the
// {hours, minutes} pair the duration form fields use — the inverse of
// toTotalMinutes below.
export function minutesToHoursAndMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.floor(totalMinutes || 0));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

export function toTotalMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

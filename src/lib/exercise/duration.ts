// Exercise duration entered as hours + minutes (same as Study) → the single
// duration_minutes the API takes, or null when it isn't a valid duration:
// whole numbers, minutes 0–59, total 1 minute to 24 hours.
export function exerciseDurationMinutes(hoursInput: string, minutesInput: string): number | null {
  const parse = (v: string) => (v.trim() === "" ? 0 : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);
  const hours = parse(hoursInput);
  const minutes = parse(minutesInput);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return total >= 1 && total <= 1440 ? total : null;
}

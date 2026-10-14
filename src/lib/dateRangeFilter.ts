import { format, subDays, parseISO, isValid } from "date-fns";

// Ports src/lib/dateRangeFilter.ts from the web app directly —
// framework-agnostic, no changes needed.
export type DateFilterPreset = "today" | "yesterday" | "last7" | "last30" | "custom";

export type DateFilterValue = {
  preset: DateFilterPreset;
  from: string; // "yyyy-MM-dd", inclusive
  to: string; // "yyyy-MM-dd", inclusive
};

function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function todayISODate(): string {
  return toISODate(new Date());
}

// Resolves a preset into a concrete {from, to} range using date-fns local-time
// arithmetic (format/subDays) rather than `Date.toISOString().slice(0, 10)` —
// toISOString() converts through UTC first, which silently rolls the date
// backward/forward for users outside UTC+0 (e.g. just after midnight local
// time).
export function resolvePresetRange(preset: Exclude<DateFilterPreset, "custom">): {
  from: string;
  to: string;
} {
  const today = new Date();
  if (preset === "today") return { from: toISODate(today), to: toISODate(today) };
  if (preset === "yesterday") {
    const y = toISODate(subDays(today, 1));
    return { from: y, to: y };
  }
  if (preset === "last7") return { from: toISODate(subDays(today, 6)), to: toISODate(today) };
  return { from: toISODate(subDays(today, 29)), to: toISODate(today) };
}

export function isValidCustomRange(from: string, to: string): boolean {
  if (!from || !to) return false;
  return isValid(parseISO(from)) && isValid(parseISO(to)) && from <= to;
}

// Date-only "yyyy-MM-dd" strings compare correctly with plain string
// comparison (lexicographic order matches chronological order) — no Date
// parsing needed for the actual filter predicate, and no timezone conversion
// to introduce an off-by-one here either.
export function isWithinDateRange(dateISO: string, range: { from: string; to: string }): boolean {
  return dateISO >= range.from && dateISO <= range.to;
}

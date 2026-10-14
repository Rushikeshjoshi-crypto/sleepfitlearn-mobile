import { isoDaysAgo } from "./dateRange";

// Local calendar days (toISOString() gives the UTC date — "Today" was
// yesterday's entries between midnight and the UTC offset).
export function dateGroupLabel(dateStr: string): string {
  const todayIso = isoDaysAgo(0);
  const yesterdayIso = isoDaysAgo(1);
  if (dateStr === todayIso) return "Today";
  if (dateStr === yesterdayIso) return "Yesterday";
  return dateStr;
}

export function groupByDate<T>(items: T[], getDate: (item: T) => string): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dateGroupLabel(getDate(item));
    const group = groups.find((g) => g.label === label);
    if (group) group.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

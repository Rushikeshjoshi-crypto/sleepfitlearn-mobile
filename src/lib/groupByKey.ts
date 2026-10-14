// Generic "one collapsible box per X" grouping — used by Study (subject),
// Exercise (activity), and Personal (metric) history sections, mirroring the
// website's per-subject/per-activity/per-metric HistoryBox pattern. Callers
// pass items already sorted newest-first, so each group's own items stay
// newest-first, and groups themselves come out in "most recently active
// first" order for free (a group's first occurrence in a newest-first list
// is necessarily its most recent item).
export function groupByKey<T>(
  items: T[],
  keyFor: (item: T) => string,
  nameFor: (key: string) => string,
): { key: string; name: string; items: T[] }[] {
  const map = new Map<string, { key: string; name: string; items: T[] }>();
  for (const item of items) {
    const key = keyFor(item);
    const existing = map.get(key);
    if (existing) existing.items.push(item);
    else map.set(key, { key, name: nameFor(key), items: [item] });
  }
  return [...map.values()];
}

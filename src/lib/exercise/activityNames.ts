import { localizedName } from "../i18n/localizedName";
import type { ActivityType, CustomActivity, ExerciseEntry } from "../api/fitness";
import { exerciseParts } from "./combine";

// Exercise history grouping and names — mirrors the web app's
// ExerciseFeed/useActivities fix: group keys never depend on the display
// name, and a title is never a raw UUID or blank.

export type ActivityLookups = {
  activityTypes: ActivityType[];
  // name may be null/"" for rows saved by older/other clients
  customActivities: (Omit<CustomActivity, "name"> & { name: string | null })[];
  language: string;
  // false while either list is loading or if either failed — then an
  // unresolved id can't be called "Deleted".
  listsReady: boolean;
};

export type ActivityFallbackLabels = { unnamed: string; deleted: string; unknown: string };

// Prefixed so a real id and a free-text name can never collide; an entry
// with neither (or a blank name) goes to "__unknown__", never to "".
export function activityGroupKey(entry: Pick<ExerciseEntry, "activity_type_id" | "custom_activity_name">): string {
  if (entry.activity_type_id) return `id:${entry.activity_type_id}`;
  const name = entry.custom_activity_name?.trim();
  return name ? `name:${name}` : "__unknown__";
}

// The group keys a row belongs to: one per activity in a combined row
// (lib/exercise/combine.ts), otherwise just its own.
export function activityGroupKeys(entry: ExerciseEntry): string[] {
  return [...new Set(exerciseParts(entry).map(activityGroupKey))];
}

// One box per activity, newest-first like groupByKey. A row combining
// several activities appears in each of their boxes; `minutes` is that
// activity's share of each row (by sk). Still one row — edit/delete act on it.
export function groupEntriesByActivity(
  entries: ExerciseEntry[],
  nameFor: (key: string) => string,
): { key: string; name: string; items: ExerciseEntry[]; minutes: Map<string, number> }[] {
  const map = new Map<string, { key: string; name: string; items: ExerciseEntry[]; minutes: Map<string, number> }>();
  for (const entry of entries) {
    for (const part of exerciseParts(entry)) {
      const key = activityGroupKey(part);
      let group = map.get(key);
      if (!group) {
        group = { key, name: nameFor(key), items: [], minutes: new Map() };
        map.set(key, group);
      }
      if (!group.minutes.has(entry.sk)) group.items.push(entry);
      group.minutes.set(entry.sk, (group.minutes.get(entry.sk) ?? 0) + part.minutes);
    }
  }
  return [...map.values()];
}

// The real name, or null: the id's custom/built-in name, else the entry's own
// free-text name (legacy rows have only that). `||`, so blanks fall through.
export function resolveActivityName(
  id: string | null,
  fallbackName: string | null | undefined,
  lookups: ActivityLookups,
): string | null {
  if (id) {
    const custom = lookups.customActivities.find((a) => a.id === id)?.name?.trim();
    if (custom) return custom;
    const type = lookups.activityTypes.find((a) => a.id === id);
    const typeName = type ? localizedName(type.name_i18n, lookups.language)?.trim() : "";
    if (typeName) return typeName;
  }
  return fallbackName?.trim() || null;
}

// Always something to show.
export function activityLabel(
  id: string | null,
  fallbackName: string | null | undefined,
  lookups: ActivityLookups,
  labels: ActivityFallbackLabels,
): string {
  const name = resolveActivityName(id, fallbackName, lookups);
  if (name) return name;
  if (id && lookups.customActivities.some((a) => a.id === id)) return labels.unnamed;
  if (id && lookups.listsReady) return labels.deleted;
  return labels.unknown;
}

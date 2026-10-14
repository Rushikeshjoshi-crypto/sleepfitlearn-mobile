import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export type ContextEventType = "screen_time" | "routine";

export type ScreenTimeAppUsage = {
  package_name: string;
  app_name: string;
  minutes_used: number;
};

// `metadata` is stored verbatim by the sleepfitlearn-context Lambda (no schema
// validation), and sleepfitlearn-insights only reads `minutes`/`adherence_pct`
// — confirmed by reading both deployed Lambdas — so the `apps` breakdown here
// is a safe, backward-compatible extra field.
export type ContextEventMetadata = {
  minutes?: number;
  adherence_pct?: number;
  apps?: ScreenTimeAppUsage[];
};

export type ContextEvent = {
  id: string;
  sk: string;
  event_type: ContextEventType;
  event_date: string;
  description: string | null;
  metadata: ContextEventMetadata | null;
  created_at: string;
  // "snapshot": a screen time day total from Android's usage record (one row
  // per day); absent on ordinary (delta) rows.
  kind?: "snapshot";
};

export type ContextEventInput = {
  event_type: ContextEventType;
  event_date: string;
  description?: string | null;
  metadata?: ContextEventMetadata | null;
  kind?: "snapshot";
};

// The context Lambda used to accept event_date: null on PUT (and old rows
// may hold anything); the Habits screen sorts and groups by it. Only events
// with a real YYYY-MM-DD are shown.
export function hasEventDate(event: ContextEvent): boolean {
  const d = event.event_date as unknown;
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(d)) return false;
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
}

// History list: usable events only, newest first.
export function prepareHabitHistory(events: ContextEvent[] | null | undefined): ContextEvent[] {
  return (Array.isArray(events) ? events : []).filter(hasEventDate).sort((a, b) => b.event_date.localeCompare(a.event_date));
}

// metadata is stored unvalidated, so keep only app items with a string
// package_name (the key apps are grouped by); a missing app_name falls back to
// the package, a non-numeric minutes_used counts as 0.
export function getApps(event: ContextEvent): ScreenTimeAppUsage[] {
  const apps: unknown = event.metadata?.apps;
  if (!Array.isArray(apps)) return [];
  const out: ScreenTimeAppUsage[] = [];
  for (const app of apps) {
    if (!app || typeof app !== "object") continue;
    const { package_name, app_name, minutes_used } = app as Partial<Record<keyof ScreenTimeAppUsage, unknown>>;
    if (typeof package_name !== "string" || !package_name) continue;
    out.push({
      package_name,
      app_name: typeof app_name === "string" && app_name ? app_name : package_name,
      minutes_used: typeof minutes_used === "number" && Number.isFinite(minutes_used) ? minutes_used : 0,
    });
  }
  return out;
}

// Per-app totals across events, most used first (was aggregateHistoryApps in
// HabitsScreen; mirrors the web's aggregateApps).
export function topApps(events: ContextEvent[]): ScreenTimeAppUsage[] {
  const byPackage = new Map<string, ScreenTimeAppUsage>();
  for (const event of events) {
    for (const app of getApps(event)) {
      const existing = byPackage.get(app.package_name);
      if (existing) existing.minutes_used += app.minutes_used;
      else byPackage.set(app.package_name, { ...app });
    }
  }
  return [...byPackage.values()].sort((a, b) => b.minutes_used - a.minutes_used);
}

export function listContextEvents(): Promise<ContextEvent[]> {
  return apiGet<ContextEvent[]>("context", "");
}

export function createContextEvent(input: ContextEventInput): Promise<ContextEvent> {
  return apiPost<ContextEvent>("context", "", input);
}

// One local day's screen time total from Android's own usage record (the
// backfill, lib/screenTime/sync.ts). The backend upserts it as ONE row per
// user + day (kind "snapshot"), so re-sending a day overwrites it.
export function upsertScreenTimeSnapshot(
  date: string,
  minutes: number,
  apps: { packageName: string; appName: string; minutesUsed: number }[],
): Promise<ContextEvent> {
  const round = (m: number) => Math.round(m * 10) / 10;
  return apiPost<ContextEvent>("context", "", {
    event_type: "screen_time",
    event_date: date,
    kind: "snapshot",
    metadata: {
      minutes: round(minutes),
      apps: apps.map((a) => ({ package_name: a.packageName, app_name: a.appName, minutes_used: round(a.minutesUsed) })),
    },
  });
}

// Same as the web app's src/lib/api/context.ts: PUT overwrites
// event_type/event_date/description/metadata unconditionally, so send the
// full record, not a partial patch. `sk` contains a "#" and must be encoded.
export function updateContextEvent(sk: string, input: ContextEventInput): Promise<ContextEvent> {
  return apiPut<ContextEvent>("context", encodeURIComponent(sk), input);
}

export function deleteContextEvent(sk: string): Promise<void> {
  return apiDelete("context", encodeURIComponent(sk));
}

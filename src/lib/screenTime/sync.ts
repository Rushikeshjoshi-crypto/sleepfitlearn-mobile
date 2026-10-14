import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContextEvent, upsertScreenTimeSnapshot } from "../api/context";
import { getCurrentUserId } from "../aws/cognito";
import { getDailyUsage, markSyncSucceeded, onSyncDue, restorePendingSync, takePendingSync } from "../native/screenTime";
import { checkScreenTimeLimit } from "../family/screenTimeLimit";
import { isBackgroundSyncAllowed } from "../syncGate";
import { recheckBackgroundGate } from "./backgroundGate";

// ── Day snapshots (backfill) ─────────────────────────────────────────────
// Every sync sends each of the last SNAPSHOT_DAYS local days as ONE snapshot
// (upserted per user + day) taken from Android's own usage record
// (ScreenTimeModule.getDailyUsage) — so days the app was closed, or the
// tracking service was dead, still get their total. Today is re-sent every
// sync (it keeps growing); an ended day is sent once and then remembered as
// final for this account on this phone. A day Android has no data for is
// skipped (shown as "no data", never 0). How far back Android keeps the
// events differs per phone (check karna padega).
const SNAPSHOT_DAYS = 7;
const finalKey = (userId: string) => `screenTime.finalDays.${userId}`;

async function readFinalDays(userId: string): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await AsyncStorage.getItem(finalKey(userId))) ?? "[]"));
  } catch {
    return new Set();
  }
}

// Returns the dates that now have a snapshot on the server (sent now, or
// final earlier) — their pending deltas must not be posted as well.
async function syncDaySnapshots(): Promise<{ covered: Set<string>; failed: boolean }> {
  const covered = new Set<string>();
  const userId = await getCurrentUserId().catch(() => null);
  if (!userId) return { covered, failed: false };
  let days;
  try {
    days = await getDailyUsage(SNAPSHOT_DAYS);
  } catch {
    return { covered, failed: false };
  }
  const finals = await readFinalDays(userId);
  let failed = false;
  let changed = false;
  for (const day of days) {
    if (!day.available) continue;
    if (day.final && finals.has(day.date)) {
      covered.add(day.date);
      continue;
    }
    try {
      await upsertScreenTimeSnapshot(day.date, day.totalMinutes, day.apps);
      covered.add(day.date);
      if (day.final) {
        finals.add(day.date);
        changed = true;
      }
    } catch {
      failed = true;
    }
  }
  if (changed) {
    // Only recent days matter (older ones are never re-read).
    const keep = [...finals].sort().slice(-SNAPSHOT_DAYS * 2);
    await AsyncStorage.setItem(finalKey(userId), JSON.stringify(keep)).catch(() => {});
  }
  return { covered, failed };
}

// Atomically takes (reads + clears in one native call) the unsynced delta —
// split by the LOCAL day the usage happened on — and posts one screen_time
// ContextEvent per day with that day as event_date (not the sync date, so
// usage at 23:50 synced at 00:10 stays on the earlier day). If a POST fails
// (offline, expired session, etc.), that day and the ones after it are handed
// back via restorePendingSync so nothing is lost — the next attempt picks
// them up. lastSyncAt is only marked once every day went through.
//
// Earlier version used a peek-then-confirm pair (getPendingSync, then
// confirmSyncFlushed only after the POST succeeded) guarded by an in-flight
// promise here in JS. That still let duplicates through: AppState can fire
// "active" more than once for a single foreground transition, and each of
// those plus the native "sync due" push resolve to *separate* JS calls once
// the previous one's promise had already settled — the in-flight guard only
// covers calls that overlap *during* the same promise, not fast sequential
// ones. Confirmed in production data as a burst of 5 POSTs of the same
// tracking session within 0.2 seconds. Taking the delta atomically in native
// code (see ScreenTimeStore.takePending) removes the peek/confirm gap
// entirely — there is no longer a state two callers can both observe.
let inFlightSync: Promise<void> | null = null;

// Gated (lib/syncGate.ts): nothing is taken or posted until this session's
// account has passed ProfileGate's age/profile check.
export function syncScreenTime(): Promise<void> {
  if (!isBackgroundSyncAllowed()) return Promise.resolve();
  return runScreenTimeSync({ checkLimit: true });
}

// For the headless ScreenTimeSync task (index.js), where no UI — and so no
// ProfileGate — runs: needs the last foreground session's gate result AND a
// fresh re-check of the account every time (backgroundGate.ts, fails
// closed). Never runs the limit check: there's no Activity for its alert.
export async function syncScreenTimeHeadless(): Promise<void> {
  if (!(await recheckBackgroundGate())) return;
  await runScreenTimeSync({ checkLimit: false });
}

function runScreenTimeSync({ checkLimit }: { checkLimit: boolean }): Promise<void> {
  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    const snapshots = await syncDaySnapshots();
    const taken = await takePendingSync();
    // A day with a snapshot on the server is complete; its deltas would
    // double-count (readers ignore them anyway), so they're dropped here.
    const days = (taken?.days ?? []).filter((d) => !snapshots.covered.has(d.date));
    if (days.length === 0) {
      if (!snapshots.failed && (snapshots.covered.size > 0 || (taken?.days.length ?? 0) > 0)) markSyncSucceeded();
      if (checkLimit && snapshots.covered.size > 0) checkScreenTimeLimit();
      return;
    }

    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      try {
        await createContextEvent({
          event_type: "screen_time",
          event_date: day.date,
          metadata: {
            minutes: day.totalMinutes,
            apps: day.apps.map((app) => ({
              package_name: app.packageName,
              app_name: app.appName,
              minutes_used: app.minutesUsed,
            })),
          },
        });
      } catch {
        for (const rest of days.slice(i)) restorePendingSync(rest.date, rest.totalMinutes, rest.apps);
        return;
      }
    }
    if (!snapshots.failed) markSyncSucceeded();
    // Parent-set daily limit (no-op unless a linked parent enabled it).
    if (checkLimit) checkScreenTimeLimit();
  })();

  return inFlightSync.finally(() => {
    inFlightSync = null;
  });
}

// Best-effort near-real-time path. The reliable path is calling
// syncScreenTime() directly from an app-foreground AppState listener (see
// App.tsx) since this native event can be missed if JS wasn't alive to
// receive it (e.g. app swiped from Recents).
export function registerScreenTimeSyncListener(): () => void {
  return onSyncDue(() => {
    syncScreenTime();
  });
}

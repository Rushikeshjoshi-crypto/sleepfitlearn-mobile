import { effectiveScreenTimeEvents } from "../habits/screenTimeAverage";
import { Alert, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "../../i18n";
import { apiGet } from "../api/client";
import type { ContextEvent } from "../api/context";
import { getUserProfile } from "../api/users";

// Parent-set daily screen-time REMINDER (not enforcement — nothing is
// blocked): after each foreground screen-time sync, compare today's synced
// total against the daily limit a linked parent set (users GET →
// effective_controls, merged server-side). Reminds once per day, in-app —
// the app has no push-notification library, so this is an Alert shown while
// the app is in the foreground. A set limit reminds unless the parent
// explicitly turned reminders off. The "reminded today" flag is written only
// after the Alert is shown, and never while the app isn't in the foreground
// (the headless sync doesn't call this at all).
//
// Called fire-and-forget from lib/screenTime/sync.ts; never throws.

const WARNED_KEY = "sfl.screenTimeLimitWarnedOn";

// Same local-calendar date sync.ts tags events with.
function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export async function checkScreenTimeLimit(): Promise<void> {
  try {
    const profile = await getUserProfile();
    const controls = profile.effective_controls;
    const limit = controls?.daily_screen_time_limit_minutes;
    if (limit == null || controls?.limit_warning_notifications === false) return;
    if (AppState.currentState !== "active") return;

    const today = todayISO();
    if ((await AsyncStorage.getItem(WARNED_KEY)) === today) return;

    const events = await apiGet<ContextEvent[]>("context", "", { from: today, to: today });
    // Today's snapshot (if any) is the day's total — its delta rows would double-count.
    const used = effectiveScreenTimeEvents(events)
      .filter((e) => e.event_type === "screen_time" && e.event_date === today)
      .reduce((sum, e) => sum + (Number(e.metadata?.minutes) || 0), 0);
    if (used < limit) return;

    const t = i18n.getFixedT(null, "Family");
    Alert.alert(t("ScreenTimeLimit.title"), t("ScreenTimeLimit.body", { used: Math.round(used), limit }), [
      { text: t("ScreenTimeLimit.ok") },
    ]);
    await AsyncStorage.setItem(WARNED_KEY, today);
  } catch {
    // Best-effort: a failed check must never break the sync path.
  }
}

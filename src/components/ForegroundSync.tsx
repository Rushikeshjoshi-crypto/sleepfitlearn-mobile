import { useEffect } from "react";
import { AppState } from "react-native";
import { syncScreenTime } from "../lib/screenTime/sync";
import { isTracking, startTracking } from "../lib/native/screenTime";
import { syncHealthConnectIfEnabled } from "../lib/healthConnect/sync";
import { syncVitals } from "../lib/vitals/sync";

// Moved out of App.tsx's Root so it only mounts inside ProfileGate — i.e.
// after the signed-in account passed the age/profile check (both syncs are
// also gated themselves via lib/syncGate.ts). Renders nothing.
//
// Reliable sync backstop: the native "sync due" push event can be missed
// if JS wasn't alive to receive it (e.g. app swiped from Recents), so every
// foreground transition also pulls and flushes whatever is pending.
// AppState's "change" event only fires on a *transition* — it never fires
// for the state the app cold-launches into — so a launch (here: the moment
// the gate passes) is synced directly instead of waiting for a later
// background/foreground cycle that may never happen in the same session.
//
// Both are fire-and-forget, so each rejection is caught and logged here —
// never left as an unhandled promise rejection.
export function runForegroundSyncs(): Promise<void> {
  return Promise.all([
    // Android can refuse to (re)start the tracking service from the
    // background (e.g. after an app update — BootReceiver now just skips
    // it), so the app being open restarts it if tracking is switched on.
    // Starting it while it already runs is a no-op (ScreenTimeService).
    isTracking()
      .then((on) => on && startTracking())
      .catch((err) => console.warn("Couldn't resume screen-time tracking", err)),
    syncScreenTime().catch((err) => console.warn("Foreground screen-time sync failed", err)),
    syncHealthConnectIfEnabled().catch((err) => console.warn("Foreground Health Connect sync failed", err)),
    // Heart rate / BP: no-op unless consented, switched on and allowed (lib/vitals/sync.ts).
    syncVitals().catch((err) => console.warn("Foreground heart rate / BP sync failed", err)),
  ]).then(() => undefined);
}

export function ForegroundSync() {
  useEffect(() => {
    if (AppState.currentState === "active") {
      runForegroundSyncs();
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runForegroundSyncs();
      }
    });
    return () => subscription.remove();
  }, []);

  return null;
}

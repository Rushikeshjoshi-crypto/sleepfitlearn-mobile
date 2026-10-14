import AsyncStorage from "@react-native-async-storage/async-storage";

// No background sync (screen time, Health Connect) may start until the
// signed-in account has passed the age/profile check in ProfileGate
// (components/family/ProfileGate.tsx) — otherwise a blocked under-18 account
// could still upload data from this device.
//
// Two scopes:
//  - this session (in memory): set by ProfileGate once it passes, cleared
//    when it blocks or unmounts (sign-out). Every foreground sync path checks it.
//  - last session (persisted): the headless ScreenTimeSync task (index.js) runs
//    with no UI, so ProfileGate never runs there; it relies on the last
//    foreground session's result instead. The backend re-checks every write
//    (minorGate.js), so this is a second line, not the only one.

const STORAGE_KEY = "sfl.backgroundSyncAllowed";
let allowedThisSession = false;

export async function setBackgroundSyncAllowed(allowed: boolean): Promise<void> {
  allowedThisSession = allowed;
  try {
    if (allowed) await AsyncStorage.setItem(STORAGE_KEY, "1");
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — the headless path then simply doesn't sync.
  }
}

// The app closing (ProfileGate unmounting) ends only THIS session's gate —
// the persisted flag stays, so the headless sync keeps working while the app
// is closed. It's cleared only on sign-out or when the account may not send
// data (clearBackgroundSyncAllowed; the headless path re-checks every time).
export function endForegroundSession(): void {
  allowedThisSession = false;
}

export async function clearBackgroundSyncAllowed(): Promise<void> {
  await setBackgroundSyncAllowed(false);
}

export function isBackgroundSyncAllowed(): boolean {
  return allowedThisSession;
}

export async function wasBackgroundSyncAllowedLastSession(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === "1";
  } catch {
    return false;
  }
}

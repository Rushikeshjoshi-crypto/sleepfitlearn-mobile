import { getFamilyStatus, isFamilyApiConfigured } from "../api/family";
import { clearBackgroundSyncAllowed, wasBackgroundSyncAllowedLastSession } from "../syncGate";
import { vitalsAllowed } from "../vitals/eligibility";

// The headless screen time sync runs with no UI (ProfileGate never runs), so
// it re-checks the account EVERY time before sending anything — the same
// rule as the backend's minorGate: adults / no birth year yes; 13–17 only
// while minor_data_enabled is on; under-13 no. Not allowed, or the status
// can't be read → the persisted flag is cleared and nothing is sent (fails
// closed); the next foreground session's ProfileGate sets it again if allowed.
export async function recheckBackgroundGate(): Promise<boolean> {
  if (!(await wasBackgroundSyncAllowedLastSession())) return false;
  let allowed = false;
  if (isFamilyApiConfigured()) {
    try {
      allowed = vitalsAllowed(await getFamilyStatus());
    } catch {
      allowed = false;
    }
  }
  if (!allowed) await clearBackgroundSyncAllowed();
  return allowed;
}

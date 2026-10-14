// Byte-identical in the mobile app and the web app (src/lib/vitals/eligibility.ts).
import { getFamilyStatus, isFamilyApiConfigured, type FamilyStatus } from "../api/family";

// Who may connect heart rate / blood pressure — the backend minorGate's rule:
// adults and accounts with no birth year yet, yes; 13–17 only while
// app_config.minor_data_enabled is on; under-13, no. Unknown status (offline,
// an error) is a no: asking for, reading and uploading HR/BP all stay off.
export function vitalsAllowed(status: FamilyStatus | null): boolean {
  if (!status) return false;
  if (status.age_band === "under_13") return false;
  if (status.age_band === "13_17") return status.enabled === true;
  return true;
}

export type VitalsAccess = { allowed: boolean; ageBand: FamilyStatus["age_band"] };

export async function checkVitalsAccess(): Promise<VitalsAccess> {
  // Without the family API there's no age band to check — stay off.
  if (!isFamilyApiConfigured()) return { allowed: false, ageBand: null };
  try {
    const status = await getFamilyStatus();
    return { allowed: vitalsAllowed(status), ageBand: status.age_band };
  } catch {
    return { allowed: false, ageBand: null };
  }
}

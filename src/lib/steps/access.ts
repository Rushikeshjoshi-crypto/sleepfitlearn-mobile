import { checkVitalsAccess } from "../vitals/eligibility";

// Who may see, ask for and sync steps — the same rule as synced HR/BP and the
// web's useVitalsAllowed(): 18+ or no birth year yet, yes; 13–17 only while
// minor_data_enabled is on; under-13, no. An unknown status (no family API,
// offline, an error) is a no (fails closed).
export async function checkStepsAllowed(): Promise<boolean> {
  try {
    return (await checkVitalsAccess()).allowed;
  } catch {
    return false;
  }
}

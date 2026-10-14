import { getCurrentUserId } from "../aws/cognito";
import { setSyncEnabled } from "../healthConnect/preference";
import { syncHealthConnect } from "../healthConnect/sync";
import { requestAllPermissions } from "../native/healthConnect";
import { checkVitalsAccess } from "../vitals/eligibility";
import { setVitalsEnabled } from "../vitals/preference";
import { syncVitals } from "../vitals/sync";
import { BASE_TYPES, VITAL_TYPES } from "./checkup";

// "Connect your watch" in one tap: ONE Health Connect permission request for
// everything (heart rate / BP only when the account may use them — checked
// live, fails closed), both syncs switched on for what was granted, and both
// run once. The vitals consent screen must already have been agreed to when
// vitals are allowed (the card shows it first).
export async function connectWatch(): Promise<{ granted: Set<string>; vitalsAllowed: boolean }> {
  const [userId, access] = await Promise.all([getCurrentUserId(), checkVitalsAccess()]);
  const granted = await requestAllPermissions(access.allowed);

  const anyBase = BASE_TYPES.some((t) => granted.has(t));
  const anyVital = access.allowed && VITAL_TYPES.some((t) => granted.has(t));
  if (anyBase) await setSyncEnabled(true);
  if (anyVital && userId) await setVitalsEnabled(userId, true);

  await Promise.allSettled([
    anyBase ? syncHealthConnect() : Promise.resolve(),
    anyVital ? syncVitals() : Promise.resolve(),
  ]);
  return { granted, vitalsAllowed: access.allowed };
}

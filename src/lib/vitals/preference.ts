import AsyncStorage from "@react-native-async-storage/async-storage";

// Heart rate / BP choices, per signed-in account on this device (another
// account on the same phone starts from scratch): whether the user agreed to
// the vitals consent screen (and which version of it), whether syncing is on,
// and when the last fully successful sync ran.
export const VITALS_CONSENT_VERSION = "vitals-v1";

const key = (userId: string, name: string) => `vitals.${name}.${userId}`;

export type VitalsState = {
  consent: { version: string; at: string } | null;
  enabled: boolean;
  lastSyncAt: string | null;
};

export async function getVitalsState(userId: string): Promise<VitalsState> {
  const [consent, enabled, lastSyncAt] = await Promise.all([
    AsyncStorage.getItem(key(userId, "consent")),
    AsyncStorage.getItem(key(userId, "enabled")),
    AsyncStorage.getItem(key(userId, "lastSyncAt")),
  ]);
  let parsed: VitalsState["consent"] = null;
  try {
    parsed = consent ? JSON.parse(consent) : null;
  } catch {
    parsed = null;
  }
  // A consent given to an older version of the screen doesn't count.
  if (parsed?.version !== VITALS_CONSENT_VERSION) parsed = null;
  return { consent: parsed, enabled: enabled === "true", lastSyncAt };
}

export async function giveVitalsConsent(userId: string): Promise<void> {
  await AsyncStorage.setItem(
    key(userId, "consent"),
    JSON.stringify({ version: VITALS_CONSENT_VERSION, at: new Date().toISOString() }),
  );
}

export async function setVitalsEnabled(userId: string, enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(key(userId, "enabled"), enabled ? "true" : "false");
}

export async function setVitalsLastSync(userId: string, at: string | null): Promise<void> {
  if (at) await AsyncStorage.setItem(key(userId, "lastSyncAt"), at);
  else await AsyncStorage.removeItem(key(userId, "lastSyncAt"));
}

import AsyncStorage from "@react-native-async-storage/async-storage";

// Health Connect has no native "is tracking" flag like screen-time's
// isTracking() (it's just on-demand reads gated by a system permission), so
// whether the user has opted in has to be remembered on our side.
const STORAGE_KEY = "healthConnectSyncEnabled";

export async function getSyncEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(STORAGE_KEY)) === "true";
}

export async function setSyncEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
}

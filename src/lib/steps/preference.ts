import AsyncStorage from "@react-native-async-storage/async-storage";

// When the last fully successful steps sync ran, per signed-in account on
// this device (another account on the same phone starts from scratch).
const key = (userId: string) => `steps.lastSyncAt.${userId}`;

export async function getStepsLastSync(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(key(userId));
}

export async function setStepsLastSync(userId: string, at: string | null): Promise<void> {
  if (at) await AsyncStorage.setItem(key(userId), at);
  else await AsyncStorage.removeItem(key(userId));
}

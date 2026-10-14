import { NativeModules, Platform } from "react-native";

// Native side: android/.../watchapps/WatchAppsModule.kt. Android only; on any
// other platform (or if the module is missing) nothing is installed and
// nothing opens.
const native = NativeModules.WatchAppsModule as
  | { installed(packages: string[]): Promise<string[]>; open(pkg: string): Promise<boolean> }
  | undefined;

export async function installedWatchApps(packages: string[]): Promise<string[]> {
  if (Platform.OS !== "android" || !native) return [];
  try {
    return await native.installed(packages);
  } catch {
    return [];
  }
}

// Opens the app (its launcher screen) so the user can turn on its Health
// Connect sharing. False if it couldn't be opened.
export async function openWatchApp(pkg: string): Promise<boolean> {
  if (Platform.OS !== "android" || !native) return false;
  try {
    return await native.open(pkg);
  } catch {
    return false;
  }
}
